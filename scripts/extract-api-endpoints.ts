import { Project, SyntaxKind, Node } from "ts-morph";
import * as path from "path";
import * as fs from "fs";

type Row = {
    method: string;
    url: string;          // итоговый (если удалось склеить baseUrl + url)
    baseUrl?: string;     // если нашли литерал
    rawUrl: string;       // как в коде (может быть динамика)
    kind: "static" | "dynamic";
    file: string;
    line: number;
};

const ROOT = process.cwd();
const TS_CONFIG = path.join(ROOT, "tsconfig.json");
const OUT = path.join(ROOT, "api-endpoints.report.json");

const METHODS = new Set(["get", "post", "put", "patch", "delete", "request"]);

const isAbsoluteUrl = (url: string) => /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);

const joinUrls = (baseUrl: string, p: string): string => {
    const trimmedBase = baseUrl.replace(/\/+$/, "");
    const trimmedPath = p.replace(/^\/+/, "");
    if (!trimmedBase) return `/${trimmedPath}`;
    if (!trimmedPath) return trimmedBase;
    return `${trimmedBase}/${trimmedPath}`;
};

const getStringLiteral = (n: Node | undefined): string | undefined => {
    if (!n) return undefined;

    // "..."
    if (Node.isStringLiteral(n)) return n.getLiteralValue();

    // `...` without ${}
    if (Node.isNoSubstitutionTemplateLiteral(n)) return n.getLiteralText();

    return undefined;
};

const getPropStringLiteral = (obj: Node | undefined, propName: string): string | undefined => {
    if (!obj || !Node.isObjectLiteralExpression(obj)) return undefined;
    const prop = obj.getProperty(propName);
    if (!prop || !Node.isPropertyAssignment(prop)) return undefined;
    return getStringLiteral(prop.getInitializer());
};

const getPropText = (obj: Node | undefined, propName: string): string | undefined => {
    if (!obj || !Node.isObjectLiteralExpression(obj)) return undefined;
    const prop = obj.getProperty(propName);
    if (!prop || !Node.isPropertyAssignment(prop)) return undefined;
    return prop.getInitializer()?.getText();
};

const project = new Project({
    tsConfigFilePath: fs.existsSync(TS_CONFIG) ? TS_CONFIG : undefined,
    skipAddingFilesFromTsConfig: false,
});

// если tsconfig не найден/не подключил файлы — добавим вручную
if (project.getSourceFiles().length === 0) {
    project.addSourceFilesAtPaths("src/**/*.{ts,tsx,js,jsx}");
}

const rows: Row[] = [];

for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();

    // пропускаем d.ts и node_modules
    if (filePath.includes("node_modules")) continue;
    if (filePath.endsWith(".d.ts")) continue;

    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of calls) {
        const expr = call.getExpression();

        // интересует только вызов вида something.get(...) / something.request(...)
        if (!Node.isPropertyAccessExpression(expr)) continue;

        const methodName = expr.getName();
        if (!METHODS.has(methodName)) continue;

        const args = call.getArguments();
        const { line } = sf.getLineAndColumnAtPos(call.getStart());

        // helper to push row
        const push = (r: Omit<Row, "file" | "line">) => {
            rows.push({
                ...r,
                file: path.relative(ROOT, filePath),
                line,
            });
        };

        // CASE 1: client.get(url, config?)
        if (methodName !== "request") {
            const urlArg = args[0];
            const configArg = args[1];

            const urlLit = getStringLiteral(urlArg);
            const baseUrlLit = getPropStringLiteral(configArg, "baseUrl");

            const rawUrl = urlArg ? urlArg.getText() : "";
            const kind: Row["kind"] = urlLit ? "static" : "dynamic";

            const finalUrl =
                urlLit && baseUrlLit && !isAbsoluteUrl(urlLit) ? joinUrls(baseUrlLit, urlLit) : (urlLit ?? rawUrl);

            push({
                method: methodName.toUpperCase(),
                url: finalUrl,
                baseUrl: baseUrlLit,
                rawUrl,
                kind,
            });

            continue;
        }

        // CASE 2: client.request({ method, url, baseUrl, ... })
        const configArg = args[0];
        const methodLit = getPropStringLiteral(configArg, "method");
        const urlLit = getPropStringLiteral(configArg, "url");
        const baseUrlLit = getPropStringLiteral(configArg, "baseUrl");

        const rawMethod = methodLit ?? (getPropText(configArg, "method") ?? "UNKNOWN");
        const rawUrl = urlLit ?? (getPropText(configArg, "url") ?? "UNKNOWN_URL");

        const kind: Row["kind"] = (methodLit && urlLit) ? "static" : "dynamic";

        const finalUrl =
            urlLit && baseUrlLit && !isAbsoluteUrl(urlLit) ? joinUrls(baseUrlLit, urlLit) : (urlLit ?? rawUrl);

        push({
            method: (methodLit ?? rawMethod).toString().toUpperCase(),
            url: finalUrl,
            baseUrl: baseUrlLit,
            rawUrl: rawUrl.toString(),
            kind,
        });
    }
}

// дедуп (но не теряем ссылки на файлы/строки — просто сгруппируем)
const key = (r: Row) => `${r.method} ${r.url} (${r.kind})`;
const grouped = new Map<string, Row[]>();
for (const r of rows) {
    const k = key(r);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(r);
}

// вывод
const report = {
    generatedAt: new Date().toISOString(),
    totalMatches: rows.length,
    unique: grouped.size,
    endpoints: Array.from(grouped.entries()).map(([k, list]) => ({
        key: k,
        method: list[0].method,
        url: list[0].url,
        kind: list[0].kind,
        baseUrl: list[0].baseUrl,
        occurrences: list.map(x => ({ file: x.file, line: x.line, rawUrl: x.rawUrl })),
    })),
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf-8");

console.log(`Saved: ${path.relative(ROOT, OUT)}`);
console.log(`Total matches: ${report.totalMatches}`);
console.log(`Unique endpoints: ${report.unique}`);
console.log(`Dynamic entries: ${report.endpoints.filter(e => e.kind === "dynamic").length}`);
