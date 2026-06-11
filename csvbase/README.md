# csvbase

A Node.js CLI that converts CSV financial data into Markdown files for use with [Knowbase](../knowbase). Point Knowbase at the output folder and query your transactions through the LLM — ask things like "how much did I spend on groceries in April?" or "what were my biggest expenses last month?"

## Requirements

- Node.js 18 or later
- No dependencies — uses Node.js built-ins only

## Installation

```bash
cd csvbase
npm link   # makes `csvbase` available globally
```

Or run directly without installing:

```bash
node index.js [options] [file]
```

## Usage

```
csvbase [options] [file]
```

| Argument | Description |
|---|---|
| `file` | Path to a `.csv` file. If omitted, picks the most recently modified `.csv` in `~/Downloads` |

| Option | Description |
|---|---|
| `-o, --out DIR` | Output directory. Defaults to `~/Documents/knowbase` |
| `-l, --list` | List all `.csv` files in `~/Downloads` |
| `--dry-run` | Print the generated Markdown to the terminal without saving |
| `-h, --help` | Show help |

## Examples

```bash
# Process the latest CSV in ~/Downloads
csvbase

# Process a specific file
csvbase ~/Downloads/transactions.csv

# Preview output without saving
csvbase ~/Downloads/transactions.csv --dry-run

# Save to a custom folder
csvbase ~/Downloads/transactions.csv -o ~/Documents/my-notes

# See what CSV files are available
csvbase --list
```

## Supported CSV formats

csvbase auto-detects column names, so it works with exports from most UK banks without any configuration.

**Signed amount format** (Monzo, Starling, most exported CSVs):

| Transaction Date | Description | Category | Amount | Balance |
|---|---|---|---|---|
| 01/04/2025 | TESCO STORES | Groceries | -45.23 | 1254.77 |
| 05/04/2025 | SALARY | Income | 2500.00 | 3754.77 |

**Separate debit/credit columns** (Barclays, HSBC, Lloyds):

| Date | Description | Debit Amount | Credit Amount | Balance |
|---|---|---|---|---|
| 01/04/2025 | TESCO STORES | 45.23 | | 1254.77 |
| 05/04/2025 | SALARY | | 2500.00 | 3754.77 |

### Detected columns

| Column type | Recognised header names |
|---|---|
| Date | `Date`, `Transaction Date`, `Value Date`, `Posted Date`, `Settled Date` |
| Description | `Description`, `Narrative`, `Memo`, `Payee`, `Merchant`, `Details`, `Name`, `Particulars`, `Counter Party` |
| Amount | `Amount`, `Transaction Amount`, `Value`, `Net` |
| Debit | `Debit`, `Debit Amount`, `Withdrawal`, `Out`, `Payments` |
| Credit | `Credit`, `Credit Amount`, `Deposit`, `In`, `Receipts` |
| Category | `Category`, `Subcategory`, `Transaction Type`, `Type` |
| Balance | `Balance`, `Running Balance`, `Account Balance` |
| Reference | `Reference`, `Ref`, `Transaction ID`, `ID` |

Column names are matched case-insensitively.

### Supported date formats

- `2025-04-01` (ISO)
- `01/04/2025`, `01-04-2025`, `01.04.2025` (UK day-first)
- `01/04/25` (short year)
- `01 Apr 2025`
- `Apr 01, 2025`

### Currency detection

The currency symbol is detected from the data. Supports `£`, `$`, `€`, `¥`. Defaults to `£` if none is found.

## Output

The generated Markdown file is saved to `~/Documents/knowbase/` (or your `--out` directory) with the filename:

```
transactions-{original-filename}-{YYYY-MM-DD}.md
```

The file contains:

1. **Summary** — total money in, total money out, net
2. **Monthly breakdown** — credits, debits, and net per month
3. **Category breakdown** — spending by category (if the CSV includes a category column)
4. **Notable transactions** — top 10 largest debits and top 5 largest credits
5. **All transactions** — full table sorted by date

## Using with Knowbase

1. Run `csvbase` to generate the Markdown file in `~/Documents/knowbase/`
2. Open Knowbase and click the folder icon to select `~/Documents/knowbase/`
3. Open the generated file and start asking questions

Example questions you can ask:

- *"How much did I spend on groceries last month?"*
- *"What are my top 5 biggest expenses?"*
- *"How does my spending in April compare to May?"*
- *"How much have I spent on subscriptions?"*
- *"What's my average monthly spending?"*
