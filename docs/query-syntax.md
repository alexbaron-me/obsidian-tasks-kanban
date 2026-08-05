# Tasks Board query syntax

Board and view `filters`, bucket `sort`, and lane `groupBy` text all compile through the same
query engine (`src/query/`), matching the [Obsidian Tasks](https://publish.obsidian.md/tasks/)
plugin's own instruction dialect wherever this plugin implements a query. One instruction per
line; blank lines and lines starting with `#` are ignored.

## Status

```
done
not done
status.type is TODO | IN_PROGRESS | DONE | CANCELLED | NON_TASK
status.name includes <text>
```

## Dates

Fields: `due`, `scheduled`, `start`, `created`, `done`, `cancelled`, `happens`.

```
<field> before <date>
<field> after <date>
<field> on <date>
<field> on or before <date>
<field> on or after <date>
<field> in <date> <date>
has <field> date
no <field> date
```

`<date>` accepts an absolute `YYYY-MM-DD` date or a natural-language phrase understood by
[chrono-node](https://github.com/wanasit/chrono) (`today`, `tomorrow`, `next friday`,
`in 3 days`), resolved relative to the render pass's frozen "today".

## Priority

```
priority is <lowest|low|none|medium|high|highest>
priority is above <value>
priority is below <value>
priority is not <value>
```

## Text and tags

```
description includes <text>
description does not include <text>
description regex matches /<pattern>/<flags>
path includes <text>
folder includes <text>
filename includes <text>
heading includes <text>
tag includes <#tag>
tag does not include <#tag>
tags include <#tag>
tags do not include <#tag>
```

Text matching is a case-insensitive substring match. Multiple instructions on separate lines are
ANDed together — there is no automatic OR for multiple tags; the filter panel's tag quick-select
synthesises an explicit `(tag includes a) OR (tag includes b)` line when you select more than one
tag.

## Recurrence and dependencies

```
is recurring
is not recurring
is blocked
is not blocked
is blocking
is not blocking
```

## Boolean composition

```
(<instruction>) AND (<instruction>)
(<instruction>) OR (<instruction>)
(<instruction>) XOR (<instruction>)
NOT (<instruction>)
```

Parenthesized and recursive to arbitrary depth — every operand must be explicitly parenthesized.
Precedence when chaining on one line: `NOT` > `AND` > `XOR` > `OR`.

```
((status.type is TODO) AND (priority is high)) OR (is recurring)
```

Known limitation: a paren character inside a `description regex matches /.../ ` pattern can
confuse the boolean tokenizer when that instruction is itself used as an operand inside a
boolean-combination line. Using such a regex as a standalone (non-boolean) filter line is
unaffected.

## Functions

```
filter by function <JS expression returning boolean>
sort by function <JS expression returning number or string>
group by function <JS expression returning string or string[]>
```

The expression runs as the body of `(task, query) => (<expression>)`, where `task` is the Tasks
runtime object and `query` is:

```ts
interface QueryContext {
  file: TasksFile;       // the .board file, or the containing note when embedded
  allTasks: readonly Task[];
  boardId: string;
  viewName: string;
  today: moment.Moment;  // frozen for the render pass
}
```

**No sandbox.** This is the same trust model as the Tasks plugin itself: functions in a `.board`
file execute with full plugin privileges — they can read and write anything the plugin process
can reach. Do not open `.board` files from untrusted sources, the same way you would not paste
untrusted code into a `tasks` codeblock.

A throwing function fails closed (`filter by function` treats it as `false`) and its error is
recorded once per expression per render pass, not once per task.

## Sort and group

```
sort by due | scheduled | start | created | done | priority | urgency | description | path | status [reverse]
group by status | status.name | status.type | priority | tags | path | folder | filename | heading | due | scheduled | happens [reverse]
```

Multiple `sort by` lines apply as secondary/tertiary sort keys, in order. A bucket's own `sort`
override wins over the view's `sort`, which wins over the default (`sort by urgency reverse`).

## Explicitly unsupported

`limit`, `limit groups`, `hide`, `show`, `short mode`, `explain`, and `ignore global query` are
recognised and reported as a clear parse error rather than silently ignored — see the non-goals
list in the top-level specification for why these aren't implemented.
