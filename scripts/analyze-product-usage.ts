// =====================
// File: scripts/analyze-product-usage.ts
// Purpose:
// - Product-level structural analysis for a frontend TypeScript project
// - Builds real reachability from runtime entrypoints
// - Extracts top-level signatures without reading implementation bodies
// - Classifies symbols by actual usage inside product source graph
//
// What it answers:
// - what is really used by the product
// - what is referenced only through barrels
// - what is a dead local candidate
// - what is an unreachable export candidate
//
// Notes:
// - tests are ignored
// - analysis is based on src/main.tsx by default
// - dynamic imports with string literals are supported on relative paths
// - implementation details are intentionally not analyzed deeply
// =====================

import fs from 'node:fs';
import path from 'node:path';
import {
    Node,
    Project,
    SourceFile,
    SyntaxKind,
    VariableDeclaration,
    FunctionDeclaration,
    ClassDeclaration,
    InterfaceDeclaration,
    TypeAliasDeclaration,
    EnumDeclaration,
} from 'ts-morph';

type SymbolKind =
    | 'function'
    | 'variable'
    | 'class'
    | 'interface'
    | 'typeAlias'
    | 'enum';

type SymbolStatus =
    | 'used_in_product'
    | 'barrel_only'
    | 'used_outside_product_scan'
    | 'exported_but_not_imported_candidate'
    | 'unreachable_export_candidate'
    | 'used_local'
    | 'dead_local_candidate'
    | 'local_in_unreachable_file';

interface DeclarationRecord {
    id: string;
    filePath: string;
    relativeFilePath: string;
    fileReachable: boolean;
    fileBarrelOnly: boolean;

    name: string;
    kind: SymbolKind;
    exported: boolean;
    defaultExport: boolean;
    typeOnly: boolean;

    signature: string;

    sameFileRefs: number;
    externalRefs: number;
    reachableRefs: number;
    reachableNonBarrelRefs: number;
    reachableBarrelRefs: number;

    status: SymbolStatus;
}

interface FileRecord {
    filePath: string;
    relativeFilePath: string;
    reachable: boolean;
    barrelOnly: boolean;
    declarationsCount: number;
    usedInProductCount: number;
    deadCandidateCount: number;
}

const ROOT_DIR = process.cwd();
const TS_CONFIG_PATH = path.resolve(ROOT_DIR, 'tsconfig.json');
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'analysis-artifacts');
const DEFAULT_ENTRYPOINTS = ['src/main.tsx'];

const CLI_ENTRYPOINTS = process.argv.slice(2);
const ENTRYPOINTS = CLI_ENTRYPOINTS.length > 0
    ? CLI_ENTRYPOINTS
    : DEFAULT_ENTRYPOINTS;

const normalizeSlashes = (value: string): string => {
    return value.replace(/\\/g, '/');
};

const toRelativeRootPath = (absPath: string): string => {
    return normalizeSlashes(path.relative(ROOT_DIR, absPath));
};

const isTestFilePath = (filePath: string): boolean => {
    const normalized = normalizeSlashes(filePath);

    return (
        normalized.includes('/src/test/') ||
        normalized.includes('/tests/')
    );
};

const isSourceFileInProduct = (sourceFile: SourceFile): boolean => {
    const filePath = normalizeSlashes(sourceFile.getFilePath());

    return (
        filePath.includes('/src/') &&
        !filePath.endsWith('.d.ts') &&
        !isTestFilePath(filePath)
    );
};

const isIndexLikeFile = (filePath: string): boolean => {
    const normalized = normalizeSlashes(filePath);

    return (
        normalized.endsWith('/index.ts') ||
        normalized.endsWith('/index.tsx')
    );
};

const ensureDir = (dirPath: string): void => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const truncate = (value: string, max = 240): string => {
    if (value.length <= max) {
        return value;
    }

    return `${value.slice(0, max - 1)}…`;
};

const compactWhitespace = (value: string): string => {
    return value.replace(/\s+/g, ' ').trim();
};

const resolveRelativeModule = (
    fromFile: SourceFile,
    moduleSpecifier: string,
    productFileMap: Map<string, SourceFile>,
): SourceFile | undefined => {
    if (!moduleSpecifier.startsWith('.')) {
        return undefined;
    }

    const fromDir = path.dirname(fromFile.getFilePath());
    const base = path.resolve(fromDir, moduleSpecifier);

    const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
        path.join(base, 'index.js'),
        path.join(base, 'index.jsx'),
    ];

    for (const candidate of candidates) {
        const normalized = normalizeSlashes(candidate);
        const hit = productFileMap.get(normalized);

        if (hit) {
            return hit;
        }
    }

    return undefined;
};

const getStaticAndDynamicDependencies = (
    sourceFile: SourceFile,
    productFileSet: Set<string>,
    productFileMap: Map<string, SourceFile>,
): SourceFile[] => {
    const result = new Map<string, SourceFile>();

    for (const importDecl of sourceFile.getImportDeclarations()) {
        const target = importDecl.getModuleSpecifierSourceFile();

        if (!target) {
            continue;
        }

        const filePath = normalizeSlashes(target.getFilePath());

        if (productFileSet.has(filePath)) {
            result.set(filePath, target);
        }
    }

    for (const exportDecl of sourceFile.getExportDeclarations()) {
        const target = exportDecl.getModuleSpecifierSourceFile();

        if (!target) {
            continue;
        }

        const filePath = normalizeSlashes(target.getFilePath());

        if (productFileSet.has(filePath)) {
            result.set(filePath, target);
        }
    }

    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expr = callExpr.getExpression();

        if (expr.getKind() !== SyntaxKind.ImportKeyword) {
            continue;
        }

        const args = callExpr.getArguments();

        if (args.length !== 1 || !Node.isStringLiteral(args[0])) {
            continue;
        }

        const target = resolveRelativeModule(
            sourceFile,
            args[0].getLiteralValue(),
            productFileMap,
        );

        if (!target) {
            continue;
        }

        const filePath = normalizeSlashes(target.getFilePath());

        if (productFileSet.has(filePath)) {
            result.set(filePath, target);
        }
    }

    return [...result.values()];
};

const isBarrelOnlyFile = (sourceFile: SourceFile): boolean => {
    const statements = sourceFile.getStatements();

    if (statements.length === 0) {
        return false;
    }

    for (const statement of statements) {
        if (
            Node.isExportDeclaration(statement) ||
            Node.isExportAssignment(statement)
        ) {
            continue;
        }

        return false;
    }

    return true;
};

const isVariableDeclarationExported = (
    decl: VariableDeclaration,
): boolean => {
    const parentStatement = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);

    return parentStatement?.isExported() ?? false;
};

const isVariableDeclarationDefaultExport = (
    decl: VariableDeclaration,
): boolean => {
    const parentStatement = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);

    return parentStatement?.isDefaultExport() ?? false;
};

const getDeclarationName = (
    decl:
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration,
): string | null => {
    if (Node.isVariableDeclaration(decl)) {
        return decl.getName();
    }

    return decl.getName() ?? null;
};

const getDeclarationNameNode = (
    decl:
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration,
): Node | null => {
    if (Node.isVariableDeclaration(decl)) {
        return decl.getNameNode();
    }

    return decl.getNameNode() ?? null;
};

const isDeclarationExported = (
    decl:
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration,
): boolean => {
    if (Node.isVariableDeclaration(decl)) {
        return isVariableDeclarationExported(decl);
    }

    return decl.isExported();
};

const isDeclarationDefaultExport = (
    decl:
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration,
): boolean => {
    if (Node.isVariableDeclaration(decl)) {
        return isVariableDeclarationDefaultExport(decl);
    }

    return decl.isDefaultExport();
};

const getDeclarationKind = (
    decl:
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration,
): SymbolKind => {
    if (Node.isFunctionDeclaration(decl)) {
        return 'function';
    }

    if (Node.isVariableDeclaration(decl)) {
        return 'variable';
    }

    if (Node.isClassDeclaration(decl)) {
        return 'class';
    }

    if (Node.isInterfaceDeclaration(decl)) {
        return 'interface';
    }

    if (Node.isTypeAliasDeclaration(decl)) {
        return 'typeAlias';
    }

    return 'enum';
};

const isTypeOnlyDeclaration = (
    decl:
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration,
): boolean => {
    return (
        Node.isInterfaceDeclaration(decl) ||
        Node.isTypeAliasDeclaration(decl)
    );
};

const getVariableSignature = (
    decl: VariableDeclaration,
): string => {
    const name = decl.getName();
    const initializer = decl.getInitializer();
    const parentStatement = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
    const declarationKind = parentStatement?.getDeclarationKind() ?? 'const';

    if (
        initializer &&
        (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
    ) {
        const params = initializer.getParameters().map(param => {
            const typeText = compactWhitespace(param.getType().getText(param));
            return `${param.getName()}: ${typeText}`;
        }).join(', ');

        const returnType = compactWhitespace(initializer.getReturnType().getText(initializer));

        return truncate(
            compactWhitespace(
                `${declarationKind} ${name} = (${params}) => ${returnType}`,
            ),
        );
    }

    const typeText = compactWhitespace(decl.getType().getText(decl));

    return truncate(
        compactWhitespace(
            `${declarationKind} ${name}: ${typeText}`,
        ),
    );
};

const getFunctionSignature = (
    decl: FunctionDeclaration,
): string => {
    const name = decl.getName() ?? 'anonymous';
    const params = decl.getParameters().map(param => {
        const typeText = compactWhitespace(param.getType().getText(param));
        return `${param.getName()}: ${typeText}`;
    }).join(', ');

    const returnType = compactWhitespace(decl.getReturnType().getText(decl));

    return truncate(
        compactWhitespace(
            `function ${name}(${params}): ${returnType}`,
        ),
    );
};

const getClassSignature = (
    decl: ClassDeclaration,
): string => {
    const name = decl.getName() ?? 'AnonymousClass';
    const typeParams = decl.getTypeParameters().map(param => param.getText()).join(', ');
    const extendsClause = decl.getExtends()?.getText();
    const implementsClause = decl.getImplements().map(item => item.getText()).join(', ');

    const parts = [`class ${name}`];

    if (typeParams) {
        parts[0] += `<${typeParams}>`;
    }

    if (extendsClause) {
        parts.push(`extends ${extendsClause}`);
    }

    if (implementsClause) {
        parts.push(`implements ${implementsClause}`);
    }

    return truncate(compactWhitespace(parts.join(' ')));
};

const getInterfaceSignature = (
    decl: InterfaceDeclaration,
): string => {
    const name = decl.getName();
    const typeParams = decl.getTypeParameters().map(param => param.getText()).join(', ');
    const extendsClause = decl.getExtends().map(item => item.getText()).join(', ');

    let signature = `interface ${name}`;

    if (typeParams) {
        signature += `<${typeParams}>`;
    }

    if (extendsClause) {
        signature += ` extends ${extendsClause}`;
    }

    return truncate(compactWhitespace(signature));
};

const getTypeAliasSignature = (
    decl: TypeAliasDeclaration,
): string => {
    const name = decl.getName();
    const typeParams = decl.getTypeParameters().map(param => param.getText()).join(', ');
    const typeText = compactWhitespace(decl.getTypeNodeOrThrow().getText());

    let signature = `type ${name}`;

    if (typeParams) {
        signature += `<${typeParams}>`;
    }

    signature += ` = ${typeText}`;

    return truncate(compactWhitespace(signature));
};

const getEnumSignature = (
    decl: EnumDeclaration,
): string => {
    return truncate(compactWhitespace(`enum ${decl.getName()}`));
};

const getDeclarationSignature = (
    decl:
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration,
): string => {
    if (Node.isVariableDeclaration(decl)) {
        return getVariableSignature(decl);
    }

    if (Node.isFunctionDeclaration(decl)) {
        return getFunctionSignature(decl);
    }

    if (Node.isClassDeclaration(decl)) {
        return getClassSignature(decl);
    }

    if (Node.isInterfaceDeclaration(decl)) {
        return getInterfaceSignature(decl);
    }

    if (Node.isTypeAliasDeclaration(decl)) {
        return getTypeAliasSignature(decl);
    }

    return getEnumSignature(decl);
};

const buildReachableFileSet = (
    entrypointFiles: SourceFile[],
    productFileSet: Set<string>,
    productFileMap: Map<string, SourceFile>,
): Set<string> => {
    const reachable = new Set<string>();
    const queue: SourceFile[] = [...entrypointFiles];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
            continue;
        }

        const currentPath = normalizeSlashes(current.getFilePath());

        if (reachable.has(currentPath)) {
            continue;
        }

        reachable.add(currentPath);

        const deps = getStaticAndDynamicDependencies(
            current,
            productFileSet,
            productFileMap,
        );

        for (const dep of deps) {
            const depPath = normalizeSlashes(dep.getFilePath());

            if (!reachable.has(depPath)) {
                queue.push(dep);
            }
        }
    }

    return reachable;
};

const getTopLevelDeclarations = (
    sourceFile: SourceFile,
): Array<
    | VariableDeclaration
    | FunctionDeclaration
    | ClassDeclaration
    | InterfaceDeclaration
    | TypeAliasDeclaration
    | EnumDeclaration
> => {
    const result: Array<
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration
    > = [];

    for (const statement of sourceFile.getStatements()) {
        if (Node.isVariableStatement(statement)) {
            for (const decl of statement.getDeclarations()) {
                result.push(decl);
            }
            continue;
        }

        if (Node.isFunctionDeclaration(statement)) {
            result.push(statement);
            continue;
        }

        if (Node.isClassDeclaration(statement)) {
            result.push(statement);
            continue;
        }

        if (Node.isInterfaceDeclaration(statement)) {
            result.push(statement);
            continue;
        }

        if (Node.isTypeAliasDeclaration(statement)) {
            result.push(statement);
            continue;
        }

        if (Node.isEnumDeclaration(statement)) {
            result.push(statement);
        }
    }

    return result;
};

const collectReferenceStats = (
    decl:
        | VariableDeclaration
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration,
    reachableFiles: Set<string>,
    productFileSet: Set<string>,
): {
    sameFileRefs: number;
    externalRefs: number;
    reachableRefs: number;
    reachableNonBarrelRefs: number;
    reachableBarrelRefs: number;
} => {
    const nameNode = getDeclarationNameNode(decl);

    if (!nameNode) {
        return {
            sameFileRefs: 0,
            externalRefs: 0,
            reachableRefs: 0,
            reachableNonBarrelRefs: 0,
            reachableBarrelRefs: 0,
        };
    }

    const declFilePath = normalizeSlashes(decl.getSourceFile().getFilePath());
    const declStart = nameNode.getStart();

    let sameFileRefs = 0;
    let externalRefs = 0;
    let reachableRefs = 0;
    let reachableNonBarrelRefs = 0;
    let reachableBarrelRefs = 0;

    const refNodes = decl.findReferencesAsNodes();

    for (const refNode of refNodes) {
        const refFile = refNode.getSourceFile();
        const refFilePath = normalizeSlashes(refFile.getFilePath());

        if (!productFileSet.has(refFilePath)) {
            continue;
        }

        if (isTestFilePath(refFilePath)) {
            continue;
        }

        if (
            refFilePath === declFilePath &&
            refNode.getStart() === declStart
        ) {
            continue;
        }

        const isSameFile = refFilePath === declFilePath;
        const isReachable = reachableFiles.has(refFilePath);
        const isBarrelRef = isIndexLikeFile(refFilePath);

        if (isSameFile) {
            sameFileRefs += 1;
        } else {
            externalRefs += 1;
        }

        if (isReachable) {
            reachableRefs += 1;

            if (isBarrelRef) {
                reachableBarrelRefs += 1;
            } else {
                reachableNonBarrelRefs += 1;
            }
        }
    }

    return {
        sameFileRefs,
        externalRefs,
        reachableRefs,
        reachableNonBarrelRefs,
        reachableBarrelRefs,
    };
};

const classifyDeclaration = (
    params: {
        exported: boolean;
        fileReachable: boolean;
        sameFileRefs: number;
        externalRefs: number;
        reachableRefs: number;
        reachableNonBarrelRefs: number;
        reachableBarrelRefs: number;
    },
): SymbolStatus => {
    const {
        exported,
        fileReachable,
        sameFileRefs,
        externalRefs,
        reachableRefs,
        reachableNonBarrelRefs,
        reachableBarrelRefs,
    } = params;

    if (exported) {
        if (reachableNonBarrelRefs > 0) {
            return 'used_in_product';
        }

        if (
            reachableBarrelRefs > 0 &&
            reachableNonBarrelRefs === 0
        ) {
            return 'barrel_only';
        }

        if (externalRefs > 0 && reachableRefs === 0) {
            return 'used_outside_product_scan';
        }

        if (fileReachable) {
            return 'exported_but_not_imported_candidate';
        }

        return 'unreachable_export_candidate';
    }

    if (sameFileRefs > 0 || externalRefs > 0) {
        return 'used_local';
    }

    if (fileReachable) {
        return 'dead_local_candidate';
    }

    return 'local_in_unreachable_file';
};

const main = (): void => {
    if (!fs.existsSync(TS_CONFIG_PATH)) {
        throw new Error(`tsconfig.json not found: ${TS_CONFIG_PATH}`);
    }

    ensureDir(OUTPUT_DIR);

    const project = new Project({
        tsConfigFilePath: TS_CONFIG_PATH,
        skipAddingFilesFromTsConfig: false,
    });

    const productSourceFiles = project
        .getSourceFiles()
        .filter(isSourceFileInProduct);

    const productFileMap = new Map<string, SourceFile>();
    const productFileSet = new Set<string>();

    for (const sourceFile of productSourceFiles) {
        const filePath = normalizeSlashes(sourceFile.getFilePath());
        productFileMap.set(filePath, sourceFile);
        productFileSet.add(filePath);
    }

    const entrypointFiles: SourceFile[] = [];

    for (const entrypoint of ENTRYPOINTS) {
        const abs = normalizeSlashes(path.resolve(ROOT_DIR, entrypoint));
        const hit = productFileMap.get(abs);

        if (!hit) {
            throw new Error(
                `Entrypoint not found in project source files: ${entrypoint}`,
            );
        }

        entrypointFiles.push(hit);
    }

    const reachableFiles = buildReachableFileSet(
        entrypointFiles,
        productFileSet,
        productFileMap,
    );

    const declarations: DeclarationRecord[] = [];
    const fileRecords: FileRecord[] = [];

    for (const sourceFile of productSourceFiles) {
        const filePath = normalizeSlashes(sourceFile.getFilePath());
        const relativeFilePath = toRelativeRootPath(filePath);
        const fileReachable = reachableFiles.has(filePath);
        const fileBarrelOnly = isBarrelOnlyFile(sourceFile);

        let usedInProductCount = 0;
        let deadCandidateCount = 0;

        const decls = getTopLevelDeclarations(sourceFile);

        for (const decl of decls) {
            const name = getDeclarationName(decl);

            if (!name) {
                continue;
            }

            const exported = isDeclarationExported(decl);
            const defaultExport = isDeclarationDefaultExport(decl);
            const kind = getDeclarationKind(decl);
            const typeOnly = isTypeOnlyDeclaration(decl);
            const signature = getDeclarationSignature(decl);

            const refStats = collectReferenceStats(
                decl,
                reachableFiles,
                productFileSet,
            );

            const status = classifyDeclaration({
                exported,
                fileReachable,
                sameFileRefs: refStats.sameFileRefs,
                externalRefs: refStats.externalRefs,
                reachableRefs: refStats.reachableRefs,
                reachableNonBarrelRefs: refStats.reachableNonBarrelRefs,
                reachableBarrelRefs: refStats.reachableBarrelRefs,
            });

            if (status === 'used_in_product') {
                usedInProductCount += 1;
            }

            if (
                status === 'dead_local_candidate' ||
                status === 'exported_but_not_imported_candidate' ||
                status === 'unreachable_export_candidate'
            ) {
                deadCandidateCount += 1;
            }

            declarations.push({
                id: `${relativeFilePath}::${name}`,
                filePath,
                relativeFilePath,
                fileReachable,
                fileBarrelOnly,

                name,
                kind,
                exported,
                defaultExport,
                typeOnly,

                signature,

                sameFileRefs: refStats.sameFileRefs,
                externalRefs: refStats.externalRefs,
                reachableRefs: refStats.reachableRefs,
                reachableNonBarrelRefs: refStats.reachableNonBarrelRefs,
                reachableBarrelRefs: refStats.reachableBarrelRefs,

                status,
            });
        }

        fileRecords.push({
            filePath,
            relativeFilePath,
            reachable: fileReachable,
            barrelOnly: fileBarrelOnly,
            declarationsCount: decls.length,
            usedInProductCount,
            deadCandidateCount,
        });
    }

    declarations.sort((a, b) => {
        if (a.relativeFilePath !== b.relativeFilePath) {
            return a.relativeFilePath.localeCompare(b.relativeFilePath);
        }

        return a.name.localeCompare(b.name);
    });

    fileRecords.sort((a, b) => {
        return a.relativeFilePath.localeCompare(b.relativeFilePath);
    });

    const summary = {
        rootDir: ROOT_DIR,
        tsConfigPath: TS_CONFIG_PATH,
        analyzedAt: new Date().toISOString(),
        entrypoints: ENTRYPOINTS,
        productFilesCount: productSourceFiles.length,
        reachableFilesCount: reachableFiles.size,
        unreachableFilesCount: productSourceFiles.length - reachableFiles.size,
        declarationsCount: declarations.length,
        byStatus: declarations.reduce<Record<string, number>>((acc, item) => {
            acc[item.status] = (acc[item.status] ?? 0) + 1;
            return acc;
        }, {}),
        topDeadCandidateFiles: [...fileRecords]
            .sort((a, b) => b.deadCandidateCount - a.deadCandidateCount)
            .slice(0, 30)
            .map(item => ({
                file: item.relativeFilePath,
                deadCandidateCount: item.deadCandidateCount,
                declarationsCount: item.declarationsCount,
                reachable: item.reachable,
                barrelOnly: item.barrelOnly,
            })),
    };

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'product-usage-summary.json'),
        JSON.stringify(summary, null, 2),
        'utf8',
    );

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'product-symbols.json'),
        JSON.stringify(declarations, null, 2),
        'utf8',
    );

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'product-files.json'),
        JSON.stringify(fileRecords, null, 2),
        'utf8',
    );

    const csvHeader = [
        'status',
        'relativeFilePath',
        'name',
        'kind',
        'exported',
        'defaultExport',
        'typeOnly',
        'fileReachable',
        'fileBarrelOnly',
        'sameFileRefs',
        'externalRefs',
        'reachableRefs',
        'reachableNonBarrelRefs',
        'reachableBarrelRefs',
        'signature',
    ].join(',');

    const csvLines = declarations.map(item => {
        const values = [
            item.status,
            item.relativeFilePath,
            item.name,
            item.kind,
            String(item.exported),
            String(item.defaultExport),
            String(item.typeOnly),
            String(item.fileReachable),
            String(item.fileBarrelOnly),
            String(item.sameFileRefs),
            String(item.externalRefs),
            String(item.reachableRefs),
            String(item.reachableNonBarrelRefs),
            String(item.reachableBarrelRefs),
            item.signature.replace(/"/g, '""'),
        ];

        return values.map(value => `"${value}"`).join(',');
    });

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'product-symbols.csv'),
        [csvHeader, ...csvLines].join('\n'),
        'utf8',
    );

    console.log('');
    console.log('Analysis complete');
    console.log(`Entrypoints: ${ENTRYPOINTS.join(', ')}`);
    console.log(`Product files: ${productSourceFiles.length}`);
    console.log(`Reachable files: ${reachableFiles.size}`);
    console.log(`Declarations: ${declarations.length}`);
    console.log('Outputs:');
    console.log(`- ${path.join(OUTPUT_DIR, 'product-usage-summary.json')}`);
    console.log(`- ${path.join(OUTPUT_DIR, 'product-symbols.json')}`);
    console.log(`- ${path.join(OUTPUT_DIR, 'product-files.json')}`);
    console.log(`- ${path.join(OUTPUT_DIR, 'product-symbols.csv')}`);
    console.log('');
};

main();