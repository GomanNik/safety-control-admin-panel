# shared/ui — REFERENCE

> Цель: зафиксировать **публичную поверхность**, **контракт поведения** и **стилизационные договорённости** для `shared/ui` на основе **только предоставленного кода и структуры**, без добавления неподтверждённых деталей.

---

## 1) Структура каталога

```txt
shared/ui/
├── classNames.ts
├── index.ts
├── REFERENCE.md
├── types.ts
├── atoms/
│   ├── badge.tsx
│   ├── button.tsx
│   ├── checkbox.tsx
│   ├── heading.tsx
│   ├── icon.tsx
│   ├── index.ts
│   ├── input.tsx
│   ├── radio.tsx
│   ├── select.tsx
│   ├── skeleton.tsx
│   ├── spinner.tsx
│   ├── switch.tsx
│   ├── tag.tsx
│   ├── text.tsx
│   └── textarea.tsx
├── layout/
│   ├── grid.tsx
│   ├── index.ts
│   ├── page-header.tsx
│   └── stack.tsx
├── molecules/
│   ├── card.tsx
│   ├── form-field.tsx
│   ├── index.ts
│   ├── modal.tsx
│   └── table.tsx
└── styles/
    ├── atoms.css
    ├── index.css
    ├── layout.css
    ├── molecules.css
    └── tokens.css
````

---

## 2) Публичная поверхность

### 2.1 Единая точка входа

```ts
import { ... } from 'shared/ui';
```

Файл `shared/ui/index.ts` экспортирует:

```ts
export * from './types';
export * from './atoms';
export * from './molecules';
export * from './layout';
```

---

## 3) Общие типы и util

### 3.1 `shared/ui/types.ts`

Экспортируются:

* `SizeToken = 'xs' | 'sm' | 'md' | 'lg'`
* `VariantToken = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'`
* `AlignToken = 'start' | 'center' | 'end' | 'stretch'`
* `JustifyToken = 'start' | 'center' | 'end' | 'between'`
* `WithChildren { children?: ReactNode }`

---

### 3.2 `shared/ui/classNames.ts`

Экспортируется:

* `joinClassNames(...values): string`

Поведение:

* склеивает классы через пробел;
* игнорирует falsy-значения: `null`, `undefined`, `false`, `''`.

Реализация:

```ts
export const joinClassNames = (
    ...values: Array<string | null | undefined | false>
): string => values.filter(Boolean).join(' ');
```

---

## 4) Layout

Файлы:

* `shared/ui/layout/grid.tsx`
* `shared/ui/layout/stack.tsx`
* `shared/ui/layout/page-header.tsx`

Точка входа:

* `shared/ui/layout/index.ts`

Экспортируются:

* `Grid` + `GridProps`
* `Stack` + `StackProps` + `StackDirection`
* `PageHeader` + `PageHeaderProps` + `PageHeaderOwnProps`

---

### 4.1 Grid (`shared/ui/layout/grid.tsx`)

#### Экспорт

* `Grid(props: GridProps): JSX.Element`
* `GridProps`

#### GridProps

Наследуется от:

* `Omit<HTMLAttributes<HTMLDivElement>, 'children'>`

Поля:

* `children?: ReactNode`
* `className?: string`

**Grid template**

* `templateColumns?: CSSProperties['gridTemplateColumns']`
* `columns?: number | 'auto-fit' | 'auto-fill'`
* `minColumnWidth?: number | string`

**Spacing**

* `gap?: string | number`

**Alignment**

* `align?: AlignToken`
* `justify?: JustifyToken`

#### Поведение

* всегда задаёт `style.display = 'grid'`;
* `gridTemplateColumns` вычисляется так:

1. если задан `templateColumns` — используется он;
2. иначе если `columns` — число `> 0`, используется `repeat(columns, minmax(0, 1fr))`;
3. иначе если `columns === 'auto-fit' | 'auto-fill'` и задан `minColumnWidth` — используется `repeat(auto-*, minmax(minWidth, 1fr))`;
4. иначе `gridTemplateColumns` автоматически не задаётся.

* `minColumnWidth`:

    * число → px;
    * строка → как есть.
* `gap`:

    * число → `"${n}px"`;
    * строка → как есть.
* `align` маппится в `alignItems`:

    * `start | center | end | stretch` → `start | center | end | stretch`
* `justify`:

    * для `start | center | end` используется `justifyItems`;
    * для `between` `justifyItems` не задаётся;
    * `justifyContent`:

        * `between` → `space-between`
        * `start | center | end` → `start | center | end`
* пользовательский `style` мерджится поверх вычисленного;
* `className = joinClassNames('ui-grid', className)`.

#### CSS-класс из `styles/layout.css`

`.ui-grid`:

* `width: 100%`

---

### 4.2 Stack (`shared/ui/layout/stack.tsx`)

#### Экспорт

* `Stack(props: StackProps): JSX.Element`
* `StackProps`
* `StackDirection = 'row' | 'column'`

#### StackProps

Наследуется от:

* `Omit<HTMLAttributes<HTMLDivElement>, 'children'>`

Поля:

* `children?: ReactNode`
* `className?: string`
* `direction?: StackDirection` — default: `'column'`
* `gap?: string | number`
* `align?: AlignToken`
* `justify?: JustifyToken`
* `wrap?: boolean`

#### Поведение

* всегда задаёт `style.display = 'flex'`;
* `flexDirection = direction` (по умолчанию `'column'`);
* `flexWrap = wrap ? 'wrap' : 'nowrap'`;
* `gap`:

    * число → px;
    * строка → как есть.
* `alignItems`:

    * `start | center | end | stretch` → `flex-start | center | flex-end | stretch`
* `justifyContent`:

    * `start | center | end | between` → `flex-start | center | flex-end | space-between`
* пользовательский `style` мерджится поверх вычисленного;
* `className = joinClassNames('ui-stack', className)`.

#### CSS-класс из `styles/layout.css`

`.ui-stack`:

* `width: 100%`

---

### 4.3 PageHeader (`shared/ui/layout/page-header.tsx`)

#### Экспорт

* `PageHeader(props: PageHeaderProps): JSX.Element`
* `PageHeaderOwnProps`
* `PageHeaderProps`

#### PageHeaderOwnProps

* `title: ReactNode`
* `subtitle?: ReactNode`
* `actions?: ReactNode`
* `breadcrumb?: ReactNode`
* `className?: string`
* `align?: AlignToken`
* `justify?: JustifyToken`

#### PageHeaderProps

* `PageHeaderOwnProps & Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'>`

#### Поведение

* рендерит `<header className="ui-page-header" ...>`;
* инлайн-лейаут:

    * `display: 'flex'`
    * `flexDirection: 'row'`
    * `gap: '1rem'`
    * `alignItems`:

        * `start | center | end | stretch` → `flex-start | center | flex-end | stretch`
        * default → `'center'`
    * `justifyContent`:

        * `start | center | end` → `flex-start | center | flex-end`
        * `between | undefined` → `'space-between'`
* пользовательский `style` мерджится поверх вычисленного.

#### Структура

* `.ui-page-header__main`

    * опционально `.ui-page-header__breadcrumb`
    * `.ui-page-header__titles`

        * `title`

            * если строка → `<h1>{title}</h1>`
            * иначе как есть
        * `subtitle`

            * если строка → `<p>{subtitle}</p>`
            * иначе как есть
* опционально `.ui-page-header__actions`

#### CSS из `styles/layout.css`

`.ui-page-header`:

* `width: 100%`
* `padding: var(--space-lg)`
* `border-radius: var(--radius-lg)`
* `border: 1px solid var(--ui-border)`
* градиентный фон
* тень

`.ui-page-header__main`:

* `display: flex`
* `flex-direction: column`
* `gap: 8px`

`.ui-page-header__breadcrumb`:

* muted-текст
* `font-size: var(--font-size-sm)`

`.ui-page-header__titles h1`:

* `margin: 0`
* увеличенный размер
* `font-weight: var(--font-weight-bold)`
* `letter-spacing: -0.02em`

`.ui-page-header__titles p`:

* `margin: 6px 0 0 0`
* secondary color
* `font-size: var(--font-size-md)`
* `line-height: var(--line-height-relaxed)`

`.ui-page-header__actions`:

* `display: flex`
* `align-items: center`
* `justify-content: flex-end`

---

## 5) Molecules

Файлы:

* `shared/ui/molecules/card.tsx`
* `shared/ui/molecules/form-field.tsx`
* `shared/ui/molecules/modal.tsx`
* `shared/ui/molecules/table.tsx`

Точка входа:

* `shared/ui/molecules/index.ts`

Экспортируются:

* `Card` + `CardProps` + `CardVariant`
* `FormField` + `FormFieldProps`
* `Modal` + `ModalProps` + `ModalSize`
* `Table` + `TableProps` + `TableColumn`

---

### 5.1 Card (`shared/ui/molecules/card.tsx`)

#### Экспорт

* `Card(props: CardProps): JSX.Element`
* `CardProps`
* `CardVariant = 'default' | 'elevated' | 'outlined' | 'ghost'`

#### CardProps

Наследуется от:

* `Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'>`

Поля:

* `children?: ReactNode`
* `header?: ReactNode`
* `footer?: ReactNode`
* `title?: ReactNode`
* `subtitle?: ReactNode`
* `variant?: CardVariant` — default: `'default'`
* `padding?: Exclude<SizeToken, 'xs'> | 'none'` — default: `'md'`
* `interactive?: boolean` — default: `false`

#### Поведение

* `hasHeaderContent = header || title || subtitle`
* корневые классы:

    * `ui-card`
    * `ui-card--variant-${variant}`
    * `ui-card--padding-${padding}`
    * `ui-card--interactive` — если `interactive`
    * плюс внешний `className`

#### Структура

* `.ui-card__header` — если есть `header/title/subtitle`

    * если задан `header` — рендерится он
    * иначе `.ui-card__header-inner`

        * `title`

            * строка → `<h3 className="ui-card__title">`
            * иначе как есть
        * `subtitle`

            * строка → `<p className="ui-card__subtitle">`
            * иначе как есть
* `.ui-card__body` — всегда
* `.ui-card__footer` — если задан `footer`

#### CSS из `styles/molecules.css`

`.ui-card`:

* радиус
* граница
* градиентный фон
* цвет текста
* `box-shadow: var(--ui-shadow-card)`
* `overflow: hidden`

Варианты:

* `.ui-card--variant-default`
* `.ui-card--variant-elevated`
* `.ui-card--variant-outlined`
* `.ui-card--variant-ghost`

Padding-модификаторы:

* `.ui-card--padding-sm .ui-card__body`
* `.ui-card--padding-md .ui-card__body`
* `.ui-card--padding-lg .ui-card__body`
* `.ui-card--padding-none .ui-card__body`

Элементы:

* `.ui-card__header`
* `.ui-card__header-inner`
* `.ui-card__title`
* `.ui-card__subtitle`
* `.ui-card__body`
* `.ui-card__footer`

Interactive:

* `.ui-card--interactive`
* `.ui-card--interactive:hover`

---

### 5.2 FormField (`shared/ui/molecules/form-field.tsx`)

#### Экспорт

* `FormField(props: FormFieldProps): JSX.Element`
* `FormFieldProps`

#### FormFieldProps

Наследуется от:

* `Omit<HTMLAttributes<HTMLDivElement>, 'children'>`

Поля:

* `label?: ReactNode`
* `labelFor?: string`
* `helpText?: ReactNode`
* `error?: ReactNode`
* `required?: boolean`
* `requiredMark?: ReactNode`
* `children?: ReactNode`

#### Поведение

* `hasError = Boolean(error)`
* корневые классы:

    * `ui-form-field`
    * `ui-form-field--error` — если есть ошибка

#### Структура

* label — только если задан `label`

    * `<label className="ui-form-field__label" htmlFor={labelFor}>`
    * если `required`:

        * `<span className="ui-form-field__required-mark">{requiredMark ?? '*'}</span>`
* `.ui-form-field__control` — содержит `children`
* если есть `helpText` и нет `error` → блок помощи
* если есть `error` → блок ошибки

#### CSS из `styles/molecules.css`

`.ui-form-field`:

* `display: inline-flex`
* `flex-direction: column`
* `gap: 6px`
* `min-width: 220px`

`.ui-form-field__label`:

* `font-size: var(--font-size-sm)`
* secondary color
* `font-weight: var(--font-weight-medium)`

`.ui-form-field__required-mark`:

* `margin-left: 6px`
* warning-mix color

`.ui-form-field__control`:

* `display: flex`
* `flex-direction: column`
* `gap: 6px`

`.ui-form-field__help-text`:

* muted color
* `font-size: var(--font-size-sm)`

`.ui-form-field__error`:

* danger-mix color
* `font-size: var(--font-size-sm)`
* `font-weight: var(--font-weight-medium)`

Для состояния ошибки:

* `.ui-form-field--error .ui-input`
* `.ui-form-field--error .ui-textarea`
* `.ui-form-field--error .ui-select`

Им задаются:

* красная граница;
* красный ring/box-shadow.

---

### 5.3 Modal (`shared/ui/molecules/modal.tsx`)

#### Экспорт

* `Modal(props: ModalProps): JSX.Element | null`
* `ModalProps`
* `ModalSize = 'sm' | 'md' | 'lg' | 'full'`

#### ModalProps

Наследуется от:

* `Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'>`

Поля:

* `open: boolean`
* `onClose?: () => void`
* `title?: ReactNode`
* `footer?: ReactNode`
* `children?: ReactNode`
* `size?: ModalSize` — default: `'md'`
* `closeOnBackdropClick?: boolean` — default: `true`
* `closeOnEsc?: boolean` — default: `true`
* `showCloseButton?: boolean` — default: `false`
* `ariaLabel?: string`
* `contentClassName?: string`
* `className?: string` — для overlay

#### Поведение

* если `open === false` → возвращает `null`;
* Esc:

    * если `open && closeOnEsc && onClose` → подписка на `keydown`;
    * при `Escape` вызывается `onClose()`;
* backdrop click:

    * обработчик на overlay;
    * если `closeOnBackdropClick && onClose` и `event.target === event.currentTarget` → `onClose()`
* классы:

    * overlay: `joinClassNames('ui-modal-overlay', className)`
    * dialog: `joinClassNames('ui-modal', 'ui-modal--size-${size}', contentClassName)`

#### ARIA

* `role="dialog"`
* `aria-modal="true"`
* `aria-label={ariaLabel}`
* `aria-labelledby` ставится только если `!ariaLabel && title`
* `aria-describedby` ставится, если есть `children`
* `useId()` используется для `titleId` и `descriptionId`

#### Структура

* overlay `<div class="ui-modal-overlay">`

    * dialog `<div class="ui-modal ...">`

        * header — если `title || showCloseButton`

            * title:

                * строка → `<h2 id={titleId} className="ui-modal__title">`
                * иначе → `<div id={titleId}>...</div>`
            * close button — если `showCloseButton`

                * `<button className="ui-modal__close" aria-label="Close">×</button>`
        * body — если есть `children`

            * `<div id={descriptionId} className="ui-modal__body">`
        * footer — если есть `footer`

            * `<div className="ui-modal__footer">`

#### CSS из `styles/molecules.css`

`.ui-modal-overlay`:

* `position: fixed`
* `inset: 0`
* `padding: var(--space-xl)`
* flex-центрирование
* затемнение фона
* `backdrop-filter: blur(8px)`
* `z-index: 1000`

`.ui-modal`:

* `width: 100%`
* `max-width: 720px`
* радиус
* граница
* градиентный фон
* тень
* `overflow: hidden`

Размеры:

* `.ui-modal--size-sm { max-width: 420px; }`
* `.ui-modal--size-md { max-width: 720px; }`
* `.ui-modal--size-lg { max-width: 980px; }`
* `.ui-modal--size-full { max-width: 1200px; }`

Элементы:

* `.ui-modal__header`
* `.ui-modal__title`
* `.ui-modal__close`
* `.ui-modal__close:hover`
* `.ui-modal__close:active`
* `.ui-modal__body`
* `.ui-modal__footer`

---

### 5.4 Table (`shared/ui/molecules/table.tsx`)

#### Экспорт

* `Table<T>(props: TableProps<T>): JSX.Element`
* `TableProps<T>`
* `TableColumn<T>`

#### TableColumn<T>

* `key: string`
* `header: ReactNode`
* `render?: (row: T, index: number) => ReactNode`
* `className?: string`
* `align?: 'left' | 'center' | 'right'`

#### TableProps<T>

Наследуется от:

* `Omit<TableHTMLAttributes<HTMLTableElement>, 'children'>`

Поля:

* `columns: TableColumn<T>[]`
* `data: T[]`
* `getRowKey?: (row: T, index: number) => string`
* `emptyState?: ReactNode`
* `rowClassName?: (row: T, index: number) => string | undefined`
* `onRowClick?: (row: T, index: number) => void`

#### Поведение

* класс таблицы: `joinClassNames('ui-table', className)`

#### Header

* `<thead className="ui-table__head">`
* `<tr className="ui-table__row ui-table__row--head">`
* `<th className="ui-table__cell ui-table__cell--head ...">`
* если `column.align` → добавляется `ui-table__cell--align-${align}`

#### Empty state

Если `data.length === 0 && emptyState`:

* одна строка `.ui-table__row--empty`
* одна ячейка `.ui-table__cell--empty` с `colSpan={columns.length}`

#### Body rows

* `rowKey`:

    * через `getRowKey(row, index)`, если задан;
    * иначе `String(index)`
* `clickable = Boolean(onRowClick)`
* строка:

    * базовый класс `ui-table__row`
    * `ui-table__row--clickable` — если есть `onRowClick`
    * плюс `rowClassName(row, index)`, если задан
    * `onClick` ставится только если задан `onRowClick`

#### Cells

Класс ячейки собирается через `resolveCellClassName`:

* `ui-table__cell`
* `ui-table__cell--align-${align}` — если задано
* `column.className`

Содержимое:

* если есть `column.render` → результат `render(row, rowIndex)`
* иначе `null`

#### CSS из `styles/molecules.css`

`.ui-table`:

* `width: 100%`
* радиус
* `overflow: hidden`
* граница
* фон

`.ui-table__head`:

* градиентный фон

`.ui-table__row`:

* transition background

`.ui-table__row--head`:

* нижняя граница

`.ui-table__cell`:

* `padding: 12px 14px`
* нижняя граница
* `font-size: var(--font-size-md)`
* primary text color

`.ui-table__cell--head`:

* `font-size: var(--font-size-sm)`
* secondary color
* bold
* uppercase
* `letter-spacing: 0.04em`

Выравнивание:

* `.ui-table__cell--align-left`
* `.ui-table__cell--align-center`
* `.ui-table__cell--align-right`

Интерактивные строки:

* `.ui-table__row--clickable:hover`

Empty state:

* `.ui-table__row--empty .ui-table__cell--empty`

---

## 6) Atoms

Точка входа:

* `shared/ui/atoms/index.ts`

Экспортирует всё из:

* `./button`
* `./badge`
* `./icon`
* `./input`
* `./select`
* `./tag`
* `./text`
* `./heading`
* `./checkbox`
* `./radio`
* `./switch`
* `./textarea`
* `./spinner`
* `./skeleton`

---

### 6.1 Общие договорённости атомов

* каждый компонент задаёт базовый класс вида `ui-*`;
* итоговый `className` собирается через `joinClassNames(...)`;
* модификаторы имеют вид:

    * `ui-<name>--variant-*`
    * `ui-<name>--size-*`
    * дополнительные:

        * `--loading`
        * `--checked`
        * `--disabled`
        * `--closable`
        * `--with-description`
        * `--truncate`
        * `--level-*`
        * `--align-*`
* в ряде атомов ставятся `data-*` атрибуты:

    * `data-variant`
    * `data-size`
    * `data-icon`

---

### 6.2 Badge (`shared/ui/atoms/badge.tsx`)

#### Экспорт

* `BadgeVariant = 'default' | 'outline' | SemanticColorKey`
* `BadgeProps extends HTMLAttributes<HTMLSpanElement>`
* `Badge(props): JSX.Element`

#### Props

* `children?: ReactNode`
* `variant?: BadgeVariant` — default: `'default'`
* остальные span-атрибуты через `...rest`

#### DOM

```tsx
<span {...rest} className={...} data-variant={variant}>
  {children}
</span>
```

#### Классы / data

* `ui-badge`
* `ui-badge--variant-${variant}`
* внешний `className`
* `data-variant={variant}`

#### CSS из `styles/atoms.css`

Базовый `.ui-badge`:

* inline-flex
* align center
* gap
* pill radius
* small font
* medium weight
* border
* background
* color
* shadow

Варианты:

* `.ui-badge--variant-default`
* `.ui-badge--variant-outline`
* `.ui-badge--variant-success`
* `.ui-badge--variant-warning`
* `.ui-badge--variant-danger`

---

### 6.3 Button (`shared/ui/atoms/button.tsx`)

#### Экспорт

* `ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'`
* `ButtonSize = 'xs' | 'sm' | 'md' | 'lg'`
* `ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>`
* `Button(props): JSX.Element`

#### Props

* `variant?: ButtonVariant` — default: `'primary'`
* `size?: ButtonSize` — default: `'md'`
* `leftIcon?: ReactNode`
* `rightIcon?: ReactNode`
* `isLoading?: boolean`
* `type?: ButtonHTMLAttributes['type']` — если не задан, используется `'button'`
* `disabled?: boolean`
* остальные button-атрибуты через `...rest`

#### Поведение

* `effectiveDisabled = disabled || Boolean(isLoading)`
* `aria-busy={isLoading || undefined}`

#### DOM

```tsx
<button
  {...rest}
  type={type ?? 'button'}
  className={...}
  data-variant={variant}
  data-size={size}
  disabled={effectiveDisabled}
  aria-busy={isLoading || undefined}
>
  {leftIcon ? <span class="ui-button__icon ui-button__icon--left">{leftIcon}</span> : null}
  {children != null ? <span class="ui-button__label">{children}</span> : null}
  {rightIcon ? <span class="ui-button__icon ui-button__icon--right">{rightIcon}</span> : null}
</button>
```

#### Классы / data

* `ui-button`
* `ui-button--variant-${variant}`
* `ui-button--size-${size}`
* `ui-button--loading` — если `isLoading`
* внешний `className`
* `data-variant={variant}`
* `data-size={size}`

#### CSS из `styles/atoms.css`

Базовый `.ui-button`:

* inline-flex
* center alignment
* gap
* user-select none
* white-space nowrap
* radius
* transparent border
* transitions
* medium font weight
* `line-height: 1`

Состояния:

* `.ui-button:active`
* `.ui-button[disabled], .ui-button:disabled`
* `.ui-button:focus-visible`

Размеры:

* `.ui-button--size-xs`
* `.ui-button--size-sm`
* `.ui-button--size-md`
* `.ui-button--size-lg`

Варианты:

* `.ui-button--variant-primary`
* `.ui-button--variant-primary:hover:not(:disabled)`
* `.ui-button--variant-secondary`
* `.ui-button--variant-secondary:hover:not(:disabled)`
* `.ui-button--variant-ghost`
* `.ui-button--variant-ghost:hover:not(:disabled)`
* `.ui-button--variant-outline`
* `.ui-button--variant-outline:hover:not(:disabled)`
* `.ui-button--variant-danger`
* `.ui-button--variant-danger:hover:not(:disabled)`

---

### 6.4 Checkbox (`shared/ui/atoms/checkbox.tsx`)

#### Экспорт

* `CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>`
* `Checkbox(props): JSX.Element`

#### Props

* `label?: ReactNode`
* `description?: ReactNode`
* `id?: string`
* остальные input-атрибуты через `...inputProps`

#### Поведение

* `inputId = idProp ?? useId()`
* `<label>` оборачивает control и текстовый блок

#### DOM

```tsx
<label className={rootClassName}>
  <span class="ui-checkbox__control">
    <input {...inputProps} id={inputId} type="checkbox" class="ui-checkbox__input" />
    <span class="ui-checkbox__box" />
  </span>

  {(label || description) && (
    <span class="ui-checkbox__content">
      {label && <span class="ui-checkbox__label">{label}</span>}
      {description && <span class="ui-checkbox__description">{description}</span>}
    </span>
  )}
</label>
```

#### Классы

* `ui-checkbox`
* `ui-checkbox--with-description` — если есть `description`
* внешний `className`

#### CSS из `styles/atoms.css`

* `.ui-checkbox`
* `.ui-checkbox__control`
* `.ui-checkbox__input`
* `.ui-checkbox__box`
* `.ui-checkbox__input:focus-visible + .ui-checkbox__box`
* `.ui-checkbox__input:checked + .ui-checkbox__box`
* `.ui-checkbox__input:checked + .ui-checkbox__box::after`
* `.ui-checkbox__content`
* `.ui-checkbox__label`
* `.ui-checkbox__description`

---

### 6.5 Heading (`shared/ui/atoms/heading.tsx`)

#### Экспорт

* `HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6`
* `HeadingAlign = 'left' | 'center' | 'right'`
* `HeadingSize = 'sm' | 'md' | 'lg'`
* `HeadingProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'children'>`
* `Heading(props): JSX.Element`

#### Props

* `children?: ReactNode`
* `level?: HeadingLevel` — default: `2`
* `as?: ElementType`
* `align?: HeadingAlign`
* `size?: HeadingSize`
* остальные атрибуты через `...rest`

#### Поведение

* `tagName = h${level}`
* `Component = as ?? tagName`

#### DOM

```tsx
<Component className={combinedClassName} {...rest}>
  {children}
</Component>
```

#### Классы

* `ui-heading`
* `ui-heading--level-${level}`
* `ui-heading--size-${size}` — если size задан
* `ui-heading--align-${align}` — если align задан
* внешний `className`

#### CSS из `styles/atoms.css`

`.ui-heading`:

* `margin: 0`
* primary text color
* `line-height: var(--line-height-tight)`
* `letter-spacing: -0.01em`

Размеры:

* `.ui-heading--size-sm`
* `.ui-heading--size-md`
* `.ui-heading--size-lg`

Выравнивание:

* `.ui-heading--align-left`
* `.ui-heading--align-center`
* `.ui-heading--align-right`

---

### 6.6 Icon (`shared/ui/atoms/icon.tsx`)

#### Экспорт

* `IconProps extends SVGProps<SVGSVGElement> { name?: string }`
* `Icon(props): JSX.Element`

#### Внутренние данные

* `ICONS: Record<string, JSX.Element>`
* содержит ключ `bell`

#### Props

* `name?: string`
* `children?: ReactNode`
* `hasExplicitLabel = rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined`

#### DOM

```tsx
<svg
  {...rest}
  className={joinClassNames('ui-icon', className)}
  data-icon={name}
  viewBox="0 0 24 24"
  aria-hidden={hasExplicitLabel ? undefined : true}
  focusable="false"
>
  {children ?? (name ? ICONS[name] : null)}
</svg>
```

#### Классы / data / aria

* `ui-icon`
* внешний `className`
* `data-icon={name}`
* если нет `aria-label` и `aria-labelledby` → `aria-hidden={true}`
* `focusable="false"`

#### CSS из `styles/atoms.css`

`.ui-icon`:

* `width: 1em`
* `height: 1em`
* `display: inline-block`
* `flex: 0 0 auto`
* `fill: currentColor`
* `vertical-align: -0.125em`

---

### 6.7 Input (`shared/ui/atoms/input.tsx`)

#### Экспорт

* `InputSize = 'sm' | 'md' | 'lg'`
* `InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>`
* `Input(props): JSX.Element`

#### Props

* `inputSize?: InputSize` — default: `'md'`
* остальные input-атрибуты через `...rest`

#### DOM

```tsx
<input {...rest} className={...} data-size={inputSize} />
```

#### Классы / data

* `ui-input`
* `ui-input--size-${inputSize}`
* внешний `className`
* `data-size={inputSize}`

#### CSS из `styles/atoms.css`

Общий блок для `.ui-input, .ui-textarea, .ui-select`:

* `width: 100%`
* radius
* border
* gradient background
* primary text color
* transitions
* shadow

Плейсхолдер:

* `.ui-input::placeholder`
* `.ui-textarea::placeholder`

Focus:

* `.ui-input:focus`
* `.ui-textarea:focus`
* `.ui-select:focus`

Disabled:

* `.ui-input:disabled`
* `.ui-textarea:disabled`
* `.ui-select:disabled`

Размеры input:

* `.ui-input--size-sm`
* `.ui-input--size-md`
* `.ui-input--size-lg`

---

### 6.8 Radio (`shared/ui/atoms/radio.tsx`)

#### Экспорт

* `RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>`
* `Radio(props): JSX.Element`

#### Props

* `label?: ReactNode`
* `description?: ReactNode`
* `id?: string`
* остальные input-атрибуты через `...inputProps`

#### Поведение

* `inputId = idProp ?? useId()`

#### DOM

```tsx
<label className={rootClassName}>
  <span class="ui-radio__control">
    <input {...inputProps} id={inputId} type="radio" class="ui-radio__input" />
    <span class="ui-radio__circle" />
  </span>

  {(label || description) && (
    <span class="ui-radio__content">
      {label && <span class="ui-radio__label">{label}</span>}
      {description && <span class="ui-radio__description">{description}</span>}
    </span>
  )}
</label>
```

#### Классы

* `ui-radio`
* `ui-radio--with-description` — если есть `description`
* внешний `className`

#### CSS из `styles/atoms.css`

* `.ui-radio`
* `.ui-radio__control`
* `.ui-radio__input`
* `.ui-radio__circle`
* `.ui-radio__input:focus-visible + .ui-radio__circle`
* `.ui-radio__input:checked + .ui-radio__circle`
* `.ui-radio__input:checked + .ui-radio__circle::after`
* `.ui-radio__content`
* `.ui-radio__label`
* `.ui-radio__description`

---

### 6.9 Select (`shared/ui/atoms/select.tsx`)

#### Экспорт

* `SelectOption { value: string | number; label: ReactNode; disabled?: boolean }`
* `SelectSize = 'sm' | 'md' | 'lg'`
* `SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>`
* `Select(props): JSX.Element`

#### Props

* `options?: SelectOption[]`
* `selectSize?: SelectSize` — default: `'md'`
* `children?: ReactNode`
* остальные select-атрибуты через `...rest`

#### Поведение

* сначала рендерятся `options?.map(...)`, потом `{children}`

#### DOM

```tsx
<select {...rest} className={...} data-size={selectSize}>
  {options?.map(option => (
    <option
      key={String(option.value)}
      value={option.value}
      disabled={option.disabled}
    >
      {option.label}
    </option>
  ))}
  {children}
</select>
```

#### Классы / data

* `ui-select`
* `ui-select--size-${selectSize}`
* внешний `className`
* `data-size={selectSize}`

#### CSS из `styles/atoms.css`

Размеры:

* `.ui-select--size-sm`
* `.ui-select--size-md`
* `.ui-select--size-lg`

Дополнительно:

* `.ui-select`

    * `appearance: none`
    * псевдо-стрелка через `background-image`
    * `background-position`
    * `background-size`
    * `background-repeat`

Тема:

* `html.theme-dark .ui-select { color-scheme: dark; }`
* `html.theme-light .ui-select { color-scheme: light; }`

Dropdown menu:

* `.ui-select option, .ui-select optgroup`

    * background / color

Также для `.ui-select` явно фиксируются:

* `color`
* `background-color`

---

### 6.10 Skeleton (`shared/ui/atoms/skeleton.tsx`)

#### Экспорт

* `SkeletonVariant = 'text' | 'rect' | 'circle'`
* `SkeletonProps extends HTMLAttributes<HTMLDivElement>`
* `Skeleton(props): JSX.Element`

#### Props

* `variant?: SkeletonVariant` — default: `'text'`
* `width?: number | string`
* `height?: number | string`
* `radius?: number | string`
* `style?: CSSProperties`
* остальные div-атрибуты через `...rest`

#### Внутреннее

`normalizeSize(value)`:

* `null | undefined` → `undefined`
* `number` → `${value}px`
* `string` → как есть

#### Поведение

`mergedStyle` включает:

* `width: normalizeSize(width)`
* `height: normalizeSize(height)`
* `borderRadius: variant === 'circle' ? '9999px' : normalizeSize(radius)`
* потом `...style` идёт последним

#### DOM

```tsx
<div
  {...rest}
  className={mergedClassName}
  style={mergedStyle}
  aria-hidden="true"
/>
```

#### Классы

* `ui-skeleton`
* `ui-skeleton--variant-${variant}`
* внешний `className`

#### CSS из `styles/atoms.css`

`.ui-skeleton`:

* `position: relative`
* `overflow: hidden`
* фон
* border-radius
* inset-shadow border

`.ui-skeleton::after`:

* shimmer-overlay
* анимация `ui-shimmer`

Анимация:

* `@keyframes ui-shimmer`

Варианты:

* `.ui-skeleton--variant-text`
* `.ui-skeleton--variant-rect`
* `.ui-skeleton--variant-circle`

---

### 6.11 Spinner (`shared/ui/atoms/spinner.tsx`)

#### Экспорт

* `SpinnerSize = 'xs' | 'sm' | 'md' | 'lg'`
* `SpinnerProps extends HTMLAttributes<HTMLSpanElement>`
* `Spinner(props): JSX.Element`

#### Props

* `size?: SpinnerSize` — default: `'md'`
* `visuallyHidden?: boolean`
* остальные span-атрибуты через `...rest`

#### A11y

* если `visuallyHidden` truthy:

    * `{ 'aria-hidden': true }`
* иначе:

    * `{ role: 'status', 'aria-live': 'polite' }`

Важно:

* `...ariaProps` идёт последним и может переопределять одноимённые атрибуты из `rest`

#### DOM

```tsx
<span {...rest} className={...} {...ariaProps}>
  <span class="ui-spinner__circle" />
</span>
```

#### Классы

* `ui-spinner`
* `ui-spinner--size-${size}`
* внешний `className`

#### CSS из `styles/atoms.css`

`.ui-spinner`:

* inline-block
* round border
* border with highlighted top color
* анимация `ui-spin`

Размеры:

* `.ui-spinner--size-xs`
* `.ui-spinner--size-sm`
* `.ui-spinner--size-md`
* `.ui-spinner--size-lg`

Анимация:

* `@keyframes ui-spin`

---

### 6.12 Switch (`shared/ui/atoms/switch.tsx`)

#### Экспорт

* `SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>`
* `Switch(props): JSX.Element`

#### Props

* `checked: boolean`
* `onCheckedChange?(checked: boolean): void`
* `label?: ReactNode`
* `description?: ReactNode`
* `disabled?: boolean`
* остальные button-атрибуты через `...rest`

#### Поведение

`handleClick()`:

* если `disabled` → return
* иначе `onCheckedChange?.(!checked)`

#### DOM / a11y

* рендерится `<button type="button">`
* `role="switch"`
* `aria-checked={checked}`
* `onClick={handleClick}` ставится после `...rest`

```tsx
<button
  {...rest}
  type="button"
  className={rootClassName}
  role="switch"
  aria-checked={checked}
  disabled={disabled}
  onClick={handleClick}
>
  <span class="ui-switch__track">
    <span class="ui-switch__thumb" />
  </span>

  {(label || description) && (
    <span class="ui-switch__content">
      {label && <span class="ui-switch__label">{label}</span>}
      {description && <span class="ui-switch__description">{description}</span>}
    </span>
  )}
</button>
```

#### Классы

* `ui-switch`
* `ui-switch--checked` — если `checked`
* `ui-switch--disabled` — если `disabled`
* внешний `className`

#### CSS из `styles/atoms.css`

* `.ui-switch`
* `.ui-switch__track`
* `.ui-switch__thumb`
* `.ui-switch--checked .ui-switch__track`
* `.ui-switch--checked .ui-switch__thumb`
* `.ui-switch--disabled`
* `.ui-switch:focus-visible .ui-switch__track`
* `.ui-switch__content`
* `.ui-switch__label`
* `.ui-switch__description`

---

### 6.13 Tag (`shared/ui/atoms/tag.tsx`)

#### Экспорт

* `TagVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'unknown' | 'outline'`
* `TagProps extends HTMLAttributes<HTMLSpanElement>`
* `Tag(props): JSX.Element`

#### Props

* `children?: ReactNode`
* `variant?: TagVariant` — default: `'default'`
* `onClose?: () => void`
* остальные span-атрибуты через `...rest`

#### Поведение

* `handleCloseClick()` вызывает `onClose?.()`
* если `onClose` задан — рендерится кнопка закрытия

#### DOM

```tsx
<span {...rest} className={...} data-variant={variant}>
  <span class="ui-tag__label">{children}</span>

  {onClose && (
    <button
      type="button"
      class="ui-tag__close"
      onClick={handleCloseClick}
      aria-label="Remove tag"
    >
      ×
    </button>
  )}
</span>
```

#### Классы / data

* `ui-tag`
* `ui-tag--variant-${variant}`
* `ui-tag--closable` — если задан `onClose`
* внешний `className`
* `data-variant={variant}`

#### CSS из `styles/atoms.css`

Базовый `.ui-tag`:

* inline-flex
* align center
* gap
* padding
* pill radius
* border
* mixed background
* color
* `box-shadow: var(--shadow-sm)`

Элементы:

* `.ui-tag__label`
* `.ui-tag__close`
* `.ui-tag__close:hover`
* `.ui-tag__close:focus-visible`

Состояние closable:

* `.ui-tag--closable`

Варианты:

* `.ui-tag--variant-default`
* `.ui-tag--variant-outline`
* `.ui-tag--variant-success`
* `.ui-tag--variant-warning`
* `.ui-tag--variant-danger`
* `.ui-tag--variant-info`
* `.ui-tag--variant-unknown`

---

### 6.14 Text (`shared/ui/atoms/text.tsx`)

#### Экспорт

* `TextVariant = 'body' | 'muted' | 'danger' | 'success' | 'caption'`
* `TextAlign = 'left' | 'center' | 'right'`
* `TextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'>`
* `Text(props): JSX.Element`

#### Props

* `as?: ElementType` — default: `'p'`
* `variant?: TextVariant` — default: `'body'`
* `align?: TextAlign`
* `truncate?: boolean`
* `children?: ReactNode`
* остальные атрибуты через `...rest`

#### DOM

```tsx
<Component className={combinedClassName} {...rest}>
  {children}
</Component>
```

#### Классы

* `ui-text`
* `ui-text--variant-${variant}`
* `ui-text--align-${align}` — если задан
* `ui-text--truncate` — если `truncate`
* внешний `className`

#### CSS из `styles/atoms.css`

Базовый `.ui-text`:

* `margin: 0`
* primary color
* `font-size: var(--font-size-md)`
* `line-height: var(--line-height-normal)`

Варианты:

* `.ui-text--variant-muted`
* `.ui-text--variant-danger`
* `.ui-text--variant-success`
* `.ui-text--variant-caption`

Выравнивание:

* `.ui-text--align-left`
* `.ui-text--align-center`
* `.ui-text--align-right`

Truncate:

* `.ui-text--truncate`

---

### 6.15 Textarea (`shared/ui/atoms/textarea.tsx`)

#### Экспорт

* `TextareaSize = 'sm' | 'md' | 'lg'`
* `TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>`
* `Textarea(props): JSX.Element`

#### Props

* `textareaSize?: TextareaSize` — default: `'md'`
* остальные textarea-атрибуты через `...rest`

#### DOM

```tsx
<textarea {...rest} className={...} data-size={textareaSize} />
```

#### Классы / data

* `ui-textarea`
* `ui-textarea--size-${textareaSize}`
* внешний `className`
* `data-size={textareaSize}`

#### CSS из `styles/atoms.css`

Размеры:

* `.ui-textarea--size-sm`
* `.ui-textarea--size-md`
* `.ui-textarea--size-lg`

---

## 7) CSS entry point

### 7.1 `shared/ui/styles/index.css`

Подключает:

```css
@import './atoms.css';
@import './tokens.css';
@import './molecules.css';
@import './layout.css';
```

Также определяет общие UI-kit переменные в `:root`:

* `--ui-control-height-sm`

* `--ui-control-height-md`

* `--ui-control-height-lg`

* `--ui-control-pad-x-sm`

* `--ui-control-pad-x-md`

* `--ui-control-pad-x-lg`

* `--ui-control-radius`

* `--ui-border`

* `--ui-border-strong`

* `--ui-surface`

* `--ui-surface-2`

* `--ui-shadow-hover`

* `--ui-shadow-card`

* `--ui-ring`

* `--ui-transition-fast`

* `--ui-transition`

Комментарий в файле:

* `/* UI-kit styles entry point */`

---

## 8) Design tokens

### 8.1 `shared/ui/styles/tokens.css`

Файл объявляет базовые CSS-переменные.

#### 8.1.1 Typography

В `:root`:

* `--font-family-main`
* `--font-family-mono`

Размеры:

* `--font-size-xs`
* `--font-size-sm`
* `--font-size-md`
* `--font-size-lg`
* `--font-size-xl`
* `--font-size-2xl`
* `--font-size-3xl`

Вес:

* `--font-weight-regular`
* `--font-weight-medium`
* `--font-weight-semibold`
* `--font-weight-bold`

Line-height:

* `--line-height-tight`
* `--line-height-normal`
* `--line-height-relaxed`

Letter-spacing:

* `--letter-spacing-tight`
* `--letter-spacing-normal`
* `--letter-spacing-wide`

---

#### 8.1.2 Spacing

В `:root`:

* `--space-0`
* `--space-2xs`
* `--space-xs`
* `--space-sm`
* `--space-md`
* `--space-lg`
* `--space-xl`
* `--space-2xl`
* `--space-3xl`
* `--space-4xl`

---

#### 8.1.3 Radius

В `:root`:

* `--radius-xs`
* `--radius-sm`
* `--radius-md`
* `--radius-lg`
* `--radius-xl`
* `--radius-pill`

---

#### 8.1.4 Borders / Shadows / Transitions

В `:root`:

* `--border-width-hairline`
* `--border-width-regular`

Shadows:

* `--shadow-sm`
* `--shadow-md`
* `--shadow-lg`
* `--shadow-xl`

Transitions:

* `--transition-fast`
* `--transition`
* `--transition-slow`

Focus:

* `--focus-ring`
* `--focus-ring-strong`

---

#### 8.1.5 Z-index

В `:root`:

* `--z-base`
* `--z-sticky`
* `--z-dropdown`
* `--z-overlay`
* `--z-modal`
* `--z-toast`
* `--z-tooltip`

---

#### 8.1.6 Color tokens

##### Default theme = dark (`:root`)

Backgrounds:

* `--color-bg-primary`
* `--color-bg-secondary`
* `--color-bg-elevated`

Text:

* `--color-text-primary`
* `--color-text-secondary`
* `--color-text-muted`

Borders:

* `--color-border-subtle`

Brand:

* `--color-primary`
* `--color-primary-strong`
* `--color-primary-soft`

Status:

* `--color-success`
* `--color-warning`
* `--color-danger`

Extra:

* `--color-info`

##### Light theme (`html.theme-light`)

Переопределяются:

* `--color-bg-primary`
* `--color-bg-secondary`
* `--color-bg-elevated`
* `--color-text-primary`
* `--color-text-secondary`
* `--color-text-muted`
* `--color-border-subtle`
* `--color-primary`
* `--color-primary-strong`
* `--color-primary-soft`
* `--color-success`
* `--color-warning`
* `--color-danger`
* `--color-info`
* `--focus-ring`
* `--focus-ring-strong`

##### Dark theme (`html.theme-dark`)

Явно объявлены те же переменные, что и в default dark:

* `--color-bg-primary`
* `--color-bg-secondary`
* `--color-bg-elevated`
* `--color-text-primary`
* `--color-text-secondary`
* `--color-text-muted`
* `--color-border-subtle`
* `--color-primary`
* `--color-primary-strong`
* `--color-primary-soft`
* `--color-success`
* `--color-warning`
* `--color-danger`
* `--color-info`
* `--focus-ring`
* `--focus-ring-strong`

---

#### 8.1.7 Density scale

Для `html[data-density="compact"]`:

* `--space-xs`
* `--space-sm`
* `--space-md`
* `--space-lg`
* `--space-xl`

---

## 9) Дополнительные CSS-правила внутри `atoms.css`

Помимо атомов, в `src/shared/ui/styles/atoms.css` присутствует scoped-блок:

```css
/* =============================
   WIDGETS (scoped by class)
   ============================= */
```

Определены классы:

* `.ui-overview-sites-health-map-widget__hint`
* `.ui-overview-sites-health-map-widget__bar`
* `.ui-overview-sites-health-map-widget__barSeg`
* `.ui-overview-sites-health-map-widget__barSeg--critical`
* `.ui-overview-sites-health-map-widget__barSeg--warning`
* `.ui-overview-sites-health-map-widget__barSeg--normal`
* `.ui-overview-sites-health-map-widget__barSeg--unknown`
* `.ui-overview-sites-health-map-widget__legendItem`
* `.ui-overview-sites-health-map-widget__legendItem--critical`
* `.ui-overview-sites-health-map-widget__legendItem--warning`
* `.ui-overview-sites-health-map-widget__legendItem--normal`
* `.ui-overview-sites-health-map-widget__legendItem--unknown`
* `.ui-overview-sites-health-map-widget__regionCard`
* `.ui-overview-sites-health-map-widget__regionCard--critical`
* `.ui-overview-sites-health-map-widget__regionCard--warning`
* `.ui-overview-sites-health-map-widget__regionCard--normal`
* `.ui-overview-sites-health-map-widget__regionCard--unknown`
* `.ui-overview-sites-health-map-widget__details`
* `.ui-overview-sites-health-map-widget__details > summary`
* `.ui-overview-sites-health-map-widget__details > summary::-webkit-details-marker`

Это не часть атомов/molecules/layout API, но эти классы реально присутствуют в предоставленном CSS.

---

## 10) Связь с `shared/index.ts`

В `shared/index.ts` присутствует общий barrel:

```ts
export * as sharedConfig from './config';
export * as sharedApi from './api';
export * as sharedUi from './ui';
export * as sharedI18n from './i18n';
export * as sharedRealtime from './realtime';
export * as sharedTheme from './theme';
```

Для `shared/ui` это означает, что модуль дополнительно доступен как namespace-экспорт:

```ts
import { sharedUi } from 'shared';
```

Но собственной публичной точкой входа UI-кита остаётся:

```ts
import { ... } from 'shared/ui';
```

---

## 11) Сводка экспортов `shared/ui`

### Из `shared/ui`

* всё из `./types`
* всё из `./atoms`
* всё из `./molecules`
* всё из `./layout`

### Из `shared/ui/layout`

* `Grid`
* `GridProps`
* `Stack`
* `StackProps`
* `StackDirection`
* `PageHeader`
* `PageHeaderProps`
* `PageHeaderOwnProps`

### Из `shared/ui/molecules`

* `Card`
* `CardProps`
* `CardVariant`
* `FormField`
* `FormFieldProps`
* `Modal`
* `ModalProps`
* `ModalSize`
* `Table`
* `TableProps`
* `TableColumn`

### Из `shared/ui/atoms`

* `Badge`

* `BadgeProps`

* `BadgeVariant`

* `Button`

* `ButtonProps`

* `ButtonVariant`

* `ButtonSize`

* `Checkbox`

* `CheckboxProps`

* `Heading`

* `HeadingProps`

* `HeadingLevel`

* `HeadingAlign`

* `HeadingSize`

* `Icon`

* `IconProps`

* `Input`

* `InputProps`

* `InputSize`

* `Radio`

* `RadioProps`

* `Select`

* `SelectProps`

* `SelectOption`

* `SelectSize`

* `Skeleton`

* `SkeletonProps`

* `SkeletonVariant`

* `Spinner`

* `SpinnerProps`

* `SpinnerSize`

* `Switch`

* `SwitchProps`

* `Tag`

* `TagProps`

* `TagVariant`

* `Text`

* `TextProps`

* `TextVariant`

* `TextAlign`

* `Textarea`

* `TextareaProps`

* `TextareaSize`

---

## 12) Ключевые инварианты модуля

* Основной публичный импорт — через `shared/ui`.
* Все классы собираются через `joinClassNames(...)`.
* `layout` управляет лейаутом в основном через inline-style, а CSS-классы дают базовую стилизацию.
* `molecules` и `atoms` используют BEM-подобные классы `ui-*`.
* Размеры, отступы, цвета, радиусы и состояния завязаны на CSS-переменные из `styles/index.css` и `styles/tokens.css`.
* В референсе зафиксировано только то, что явно следует из предоставленных TSX/CSS-описаний и структуры.



