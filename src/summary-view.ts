// ==UserScript==
// @name         Improved summary view
// @namespace    https://osak.jp/
// @version      2024-02-19
// @description  Improve summary view
// @author       Osamu Koga
// @match        https://site1.sbisec.co.jp/ETGate/?_ControlID=WPLETacR001Control*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sbisec.co.jp
// @grant        none
// ==/UserScript==

interface Order {
    name: string;
    status: string;
    amount: PaymentAmount;
}

interface PaymentAmount {
    moneyAmount: number;
    pointAmount: number;
}

interface AccountSummaryPage {
    summaryTable: HTMLElement;
    allHeader: HTMLElement;
    accountInfo: HTMLElement;
    mainPane: {
        leftColumn: {
            balanceTable: HTMLElement;
            nisaTable: HTMLElement;
            valuationTable: HTMLElement;
        },
        rightColumn: {
            stockTable: HTMLElement;
            fundTable: HTMLElement;
            nisaFundTable: HTMLElement;
            nisaTsumitateTable: HTMLElement;
        }
    }
}

function ensure(maybeElem: HTMLElement | null, message: string): HTMLElement {
    if (maybeElem == null) {
        throw new Error(message);
    }
    return maybeElem;
}

function findTitledTable(tables: HTMLElement[], title: string): HTMLElement {
    const element = tables.find((table) => {
        const tableTitle = table.querySelector('tr:first-of-type')?.textContent;
        return tableTitle == title;
    });
    if (element == null) {
        throw new Error(`Table titled ${title} not found`);
    }
    return element;
}

async function fetchPageDom(url: string): Promise<Document> {
    const res = await fetch(url);
    const htmlBuf = await res.arrayBuffer();
    const decoder = new TextDecoder('shift_jis');
    const html = decoder.decode(htmlBuf);
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
}

function accountSummaryPage(doc: Document): AccountSummaryPage {
    const summaryTable = ensure(doc.body.getElementsByTagName('table')[0], 'Top-level table not found');
    const map = ensure(summaryTable.querySelector('map[name="tab_ac"]'), 'Tabs not found');

    const summaryPaneTable = ensure(map.nextElementSibling as HTMLElement, 'Summary pane table not found');
    const summaryPane = ensure((summaryPaneTable as HTMLElement).querySelector('tbody > tr > td:nth-of-type(2)'), 'Summary pane not found');

    const tables = summaryPane.querySelectorAll('table');
    const allHeader = ensure(tables[0], 'allHeader not found');
    const accountInfo = ensure(tables[1], 'accountInfo not found');
    const mainPane = ensure(tables[3], 'mainPane not found');
    const leftColumn = ensure(mainPane.querySelector('tbody > tr > td:nth-of-type(1)'), 'Left column not found');
    const rightColumn = ensure(mainPane.querySelector('tbody > tr > td:nth-of-type(3)'), 'Right column not found');
    const rightTables = Array.from(rightColumn.querySelectorAll('table'));

    return {
        summaryTable,
        allHeader,
        accountInfo,
        mainPane: {
            leftColumn: {
                balanceTable: ensure(leftColumn.querySelector('table:nth-of-type(1)'), 'Balance table not found'),
                nisaTable: ensure(leftColumn.querySelector('table:nth-of-type(3)'), 'NISA table not found'),
                valuationTable: ensure(leftColumn.querySelector('table:nth-of-type(4)'), 'Valuation table not found'),
            },
            rightColumn: {
                stockTable: findTitledTable(rightTables, '株式（現物/特定預り）'),
                fundTable: findTitledTable(rightTables, '投資信託（金額/特定預り）'),
                nisaFundTable: findTitledTable(rightTables, '投資信託（金額/NISA預り（成長投資枠））'),
                nisaTsumitateTable: findTitledTable(rightTables, '投資信託（金額/NISA預り（つみたて投資枠））'),
            },
        }
    };
}

function parsePaymentAmount(text: string): PaymentAmount | null {
    const match = text.match(/([0-9,]+)円(\s*\(([0-9,]+)ポイント\))?/);
    if (match == null) {
        return null;
    }
    const moneyAmount = match[1] != null ? parseInt(match[1].replace(/,/g, '')) : 0;
    const pointAmount = match[3] != null ? parseInt(match[3].replace(/,/g, '')) : 0;
    return { moneyAmount, pointAmount };
}

function formatPaymentAmount(paymentAmount: PaymentAmount): string {
    const format = new Intl.NumberFormat();
    return `${format.format(paymentAmount.moneyAmount)}円 (${format.format(paymentAmount.pointAmount)}ポイント)`;
}


async function fetchFundOrders(): Promise<Order[]> {
    const root = await fetchPageDom('https://site1.sbisec.co.jp/ETGate/?_ControlID=WPLETitT010Control');
    const table = root.querySelector('table.md-l-table-01');
    if (table == undefined) {
        throw new Error('Orders table not found');
    }

    const rows = table.querySelectorAll('tbody > tr');
    const orders: Order[] = [];
    for (let i = 0; i < rows.length; i += 2) {
        const headerRow = rows[i];
        const headerCells = headerRow.querySelectorAll('td');
        const dataRow = rows[i+1];
        const dataCells = dataRow.querySelectorAll('td');

        const name = headerCells[2].innerText;
        const status = headerCells[1].innerText;
        const amount = parsePaymentAmount(dataCells[2].innerText);
        if (amount == null) {
            continue;
        }
        orders.push({name, status, amount});
    }
    return orders;
}

(function() {
    const page = accountSummaryPage(document);

    fetchFundOrders()
    .then((orders) => {
        const orderTable = document.createElement('table');
        orderTable.style.width = '340';
        orderTable.style.marginTop = '0.5em';

        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<td bgcolor="#414982" colspan=3 class="mtext-w"><b style="color:#99cc00">|</b> 注文中投資信託</td>';
        orderTable.appendChild(headerRow);

        let totalPaymentAmount: PaymentAmount = {
            moneyAmount: 0,
            pointAmount: 0,
        };
        orders.forEach((order, i) => {
            const row = document.createElement('tr');
            row.style.backgroundColor = i % 2 == 0 ? '#ffffff' : '#eeeeee';
            row.innerHTML = `<td class="mtext">${order.name}</td><td class="mtext">${order.status}</td><td class="mtext">${formatPaymentAmount(order.amount)}</td>`;
            orderTable.appendChild(row);
            totalPaymentAmount.moneyAmount += order.amount.moneyAmount;
            totalPaymentAmount.pointAmount += order.amount.pointAmount;
        });
        const summaryRow = document.createElement('tr');
        summaryRow.style.backgroundColor = '#e6e5ff';
        summaryRow.innerHTML = `<td class="mtext"><b>計</b></td><td></td><td class="mtext">${formatPaymentAmount(totalPaymentAmount)}</td>`;
        orderTable.appendChild(summaryRow);

        page.mainPane.leftColumn.valuationTable.parentNode!!.appendChild(orderTable);
    });
})();
