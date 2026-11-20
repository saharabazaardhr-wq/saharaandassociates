const assert = require('assert');
const E = require('./engine.js'), T = require('./tally.js');
const hdr = '<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC><DATA>';
const masters = hdr + `
<TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Retail Debtors" RESERVEDNAME=""><PARENT>Sundry Debtors</PARENT></GROUP></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Northstar Industries Pvt Ltd" RESERVEDNAME=""><PARENT>Retail Debtors</PARENT><OPENINGBALANCE>-125000.00</OPENINGBALANCE><PARTYGSTIN>06AABCN4521K1Z7</PARTYGSTIN><LEDSTATENAME>Haryana</LEDSTATENAME><BILLCREDITPERIOD>30 Days</BILLCREDITPERIOD><ADDRESS.LIST TYPE="String"><ADDRESS>Plot 4, Sector 18</ADDRESS><ADDRESS>Gurugram</ADDRESS></ADDRESS.LIST><LANGUAGENAME.LIST><NAME.LIST TYPE="String"><NAME>Northstar Industries Pvt Ltd</NAME></NAME.LIST></LANGUAGENAME.LIST></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Shree Steel &amp; Co" RESERVEDNAME=""><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE>84000.00</OPENINGBALANCE><LEDSTATENAME>Punjab</LEDSTATENAME></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="HDFC Bank" RESERVEDNAME=""><PARENT>Bank Accounts</PARENT><OPENINGBALANCE>-50000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Cash" RESERVEDNAME=""><PARENT>Cash-in-Hand</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Sales @18%" RESERVEDNAME=""><PARENT>Sales Accounts</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Output CGST" RESERVEDNAME=""><PARENT>Duties &amp; Taxes</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Shop Rent" RESERVEDNAME=""><PARENT>Indirect Expenses</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKITEM NAME="Basmati Rice 25kg" RESERVEDNAME=""><PARENT>Grocery</PARENT><BASEUNITS>Nos</BASEUNITS><OPENINGBALANCE>40 Nos</OPENINGBALANCE><OPENINGRATE>900.00/Nos</OPENINGRATE><GSTDETAILS.LIST><HSNCODE>1006</HSNCODE><STATEWISEDETAILS.LIST><RATEDETAILS.LIST><GSTRATEDUTYHEAD>Central Tax</GSTRATEDUTYHEAD><GSTRATE> 2.5</GSTRATE></RATEDETAILS.LIST><RATEDETAILS.LIST><GSTRATEDUTYHEAD>State Tax</GSTRATEDUTYHEAD><GSTRATE> 2.5</GSTRATE></RATEDETAILS.LIST></STATEWISEDETAILS.LIST></GSTDETAILS.LIST></STOCKITEM></TALLYMESSAGE>
</DATA></BODY></ENVELOPE>`;
const V = (type, num, date, inner, extra) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Invoice Voucher View"><DATE>${date}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${num}</VOUCHERNUMBER>${extra || ''}${inner}</VOUCHER></TALLYMESSAGE>`;
const LE = (n, amt, bills) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${n}</LEDGERNAME><ISDEEMEDPOSITIVE>${amt < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amt.toFixed(2)}</AMOUNT>${bills || ''}</ALLLEDGERENTRIES.LIST>`;
const BA = (name, type, amt) => `<BILLALLOCATIONS.LIST><NAME>${name}</NAME><BILLTYPE>${type}</BILLTYPE><AMOUNT>${amt}</AMOUNT></BILLALLOCATIONS.LIST>`;
const INV = (item, q, rate, amt, led) => `<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>${item}</STOCKITEMNAME><RATE>${rate}/Nos</RATE><AMOUNT>${amt.toFixed(2)}</AMOUNT><BILLEDQTY>${q} Nos</BILLEDQTY><ACTUALQTY>${q} Nos</ACTUALQTY><ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>${led}</LEDGERNAME><AMOUNT>${amt.toFixed(2)}</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>`;
const vouchers = hdr +
  // sale with inventory, intra-state: 10 x 1000 = 10000, 5% => 250+250, total 10500
  V('Sales', '1', '20250410', LE('Northstar Industries Pvt Ltd', -10500) + LE('Output CGST', 250) + LE('Output SGST', 250) + INV('Basmati Rice 25kg', 10, '1000.00', 10000, 'Sales @18%'), '<PARTYLEDGERNAME>Northstar Industries Pvt Ltd</PARTYLEDGERNAME><REFERENCE>PO-77</REFERENCE><NARRATION>April supply &#4; ok</NARRATION>') +
  // purchase accounting-only (no inventory), supplier invoice ref
  V('Purchase', '1', '20250412', LE('Shree Steel &amp; Co', 11800) + LE('Purchase Accounts', -10000) + LE('Input CGST', -900) + LE('Input SGST', -900), '<PARTYLEDGERNAME>Shree Steel &amp; Co</PARTYLEDGERNAME><REFERENCE>SS/0412</REFERENCE>') +
  // receipt against bill 1
  V('Receipt', '1', '20250420', LE('HDFC Bank', -10500) + LE('Northstar Industries Pvt Ltd', 10500, BA('1', 'Agst Ref', 10500))) +
  // payment to supplier, no bill refs -> FIFO
  V('Payment', '1', '20250425', LE('Shree Steel &amp; Co', -5000) + LE('HDFC Bank', 5000)) +
  // payment for rent with gst-free
  V('Payment', '2', '20250426', LE('Shop Rent', -8000) + LE('Cash', 8000)) +
  // contra
  V('Contra', '1', '20250427', LE('HDFC Bank', -3000) + LE('Cash', 3000)) +
  // journal + credit note + cancelled sale (skipped)
  V('Journal', '1', '20250428', LE('Shop Rent', -100) + LE('Cash', 100)) +
  V('Credit Note', '1', '20250429', LE('Northstar Industries Pvt Ltd', 500)) +
  `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales"><DATE>20250430</DATE><VOUCHERNUMBER>2</VOUCHERNUMBER><ISCANCELLED>Yes</ISCANCELLED></VOUCHER></TALLYMESSAGE>` +
  '</DATA></BODY></ENVELOPE>';

require('fs').mkdirSync('/tmp/tx', { recursive: true }); require('fs').writeFileSync('/tmp/tx/masters.xml', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(masters, 'utf16le')])); require('fs').writeFileSync('/tmp/tx/vouchers.xml', vouchers);
// utf-16 decode
const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(masters, 'utf16le')]);
assert.strictEqual(T.decodeBuffer(u16.buffer.slice(u16.byteOffset, u16.byteOffset + u16.length)).length, masters.length);

const D = T.extract([T.parseXML(masters), T.parseXML(vouchers)]);
assert.strictEqual(D.ledgers.length, 7); assert.strictEqual(D.items.length, 1); assert.strictEqual(D.vouchers.length, 9);
assert.strictEqual(D.items[0].gst, 5); assert.strictEqual(D.items[0].hsn, '1006');
assert.strictEqual(D.ledgers.find((l) => l.name === 'Shree Steel & Co').parent, 'Sundry Creditors');

const S = E.defaultState('2025-04-01'); S.booksFrom = '2025-04-01';
const rep = T.apply(S, D, { opening: true });
console.log(JSON.stringify(rep, null, 1));
assert.strictEqual(S.parties.length, 2);
const ns = S.parties.find((p) => p.name.startsWith('Northstar'));
assert.strictEqual(ns.gstin, '06AABCN4521K1Z7'); assert.strictEqual(ns.opening, 125000); assert.strictEqual(ns.openingType, 'Dr'); assert.strictEqual(ns.creditDays, 30); assert.strictEqual(ns.stateCode, '06');
const ss = S.parties.find((p) => p.name.startsWith('Shree')); assert.strictEqual(ss.openingType, 'Cr'); assert.strictEqual(ss.opening, 84000);
const sale = S.vouchers.find((v) => v.type === 'sale');
assert.strictEqual(sale.no, '1'); assert.strictEqual(sale.total, 10500); assert.strictEqual(sale.cgst, 250); assert.strictEqual(sale.refNo, 'PO-77'); assert.strictEqual(sale.lines[0].gst, 5); assert.strictEqual(sale.lines[0].hsn, '1006');
const pur = S.vouchers.find((v) => v.type === 'purchase');
assert.strictEqual(pur.total, 11800); assert.strictEqual(pur.refNo, 'SS/0412'); assert.strictEqual(pur.lines[0].gst, 18);
const rc = S.vouchers.find((v) => v.type === 'receipt');
assert.strictEqual(rc.amount, 10500); assert.deepStrictEqual(rc.alloc.map((a) => a.amt), [10500]); assert.strictEqual(rc.alloc[0].ref, sale.id);
const pay = S.vouchers.find((v) => v.type === 'payment'); assert.strictEqual(pay.amount, 5000); assert.strictEqual(pay.alloc[0].ref, 'open:' + ss.id);
const ex = S.vouchers.find((v) => v.type === 'expense'); assert.strictEqual(ex.amount, 8000); assert.strictEqual(S.accounts.find((a) => 'a:' + a.id === ex.head).name, 'Shop Rent'); assert.strictEqual(ex.paidFrom, 'a:cash');
const co = S.vouchers.find((v) => v.type === 'contra'); assert.strictEqual(co.amount, 3000); assert.strictEqual(co.from, 'a:cash');
assert.strictEqual(rep.imported, 6); assert.strictEqual(rep.skipped['journal vouchers'], 1); assert.strictEqual(rep.skipped['credit notes'], 1); assert.strictEqual(rep.skipped.cancelled, 1);
const hd = S.accounts.find((a) => a.name === 'HDFC Bank'); assert.strictEqual(hd.group, 'Bank Accounts'); assert.strictEqual(hd.opening, 50000); assert.strictEqual(hd.openingType, 'Dr');
assert.ok(S.items.find((i) => i.name === 'Basmati Rice 25kg' && i.openQty === 40 && i.gst === 5));
// books must still tally
const tb = E.trialBalance(S, E.buildIndex(S), 2025); assert.ok(tb.tally, 'trial balance tallies after import: ' + tb.dr + ' vs ' + tb.cr);
// re-import is a no-op
const rep2 = T.apply(S, D, { opening: true });
assert.strictEqual(rep2.imported, 0); assert.strictEqual(rep2.duplicates, 6); assert.strictEqual(S.vouchers.length, 6);
// vouchers-only file (no masters): parties inferred
const S3 = E.defaultState('2025-04-01'); const r3 = T.apply(S3, T.extract([T.parseXML(vouchers)]), { opening: false });
assert.strictEqual(r3.imported, 6); assert.ok(S3.parties.length >= 2, 'without masters, unknown ledgers in receipts/payments are treated as parties');
console.log('tally tests OK');
