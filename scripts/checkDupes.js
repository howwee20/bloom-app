const fs = require('fs');

const files = ['catalog/top100.json', 'catalog/batch2.json', 'catalog/batch3.json', 'catalog/batch4.json'];
let all = [];
files.forEach(f => {
  if (fs.existsSync(f)) {
    all = all.concat(JSON.parse(fs.readFileSync(f)));
  }
});

console.log('Total existing:', all.length);
const codes = new Set(all.map(i => i.style_code));

const newCodes = [
  'CD4487-100','555088-140','555088-311','555088-700','555088-013','555088-041','555088-201','555088-500',
  '555088-126','555088-302','555088-081','555088-062','BV1300-106','BV1300-146','DM7866-140','DM7866-162',
  'DM7866-001','308497-406','CU1110-010','308497-060','DC7770-160','308497-007','CI1184-146','DC9533-800',
  'DC9533-001','CV9388-100','AQ9129-200','308497-100','AQ3816-056','CT8480-001','DH8565-100','CN1084-200',
  'DH0690-200','384664-060','CT4954-007','378037-003','378037-101','378037-006','378037-010','378037-001',
  'CT5053-001','CU3244-100','CT2552-800','CJ5378-300','CJ5378-700','CJ5378-800','DC9936-100','CZ2239-600',
  'CV1628-800','BQ6817-600','DJ9649-400','DJ9649-401','DJ9649-500','CT0856-100','CT0856-600','CT0856-700',
  'CU1726-500','DA1469-200','DA1469-001','CZ2667-400','CU1727-100','CU1727-800','CZ6501-101','CZ9747-900',
  'DO9392-200','DO9392-700','AJ4219-144','AR4237-100','BV0073-100','BV0073-001','BV0073-400','CV1363-001',
  'CV1363-100','CW2190-300','CD4991-700','CD4991-100','CD4991-100','CD4991-400','CP9652','AH2203','B37571',
  'CP9366','BY1604','FU9006','BY9612','F99710','FW5190','FZ1267','M990JD3','M990JJ3','M990KI3','M992K1',
  'M992JFG1','BB550AHD','BB550AHE','M2002RDA','M2002RDB','1201A457-100','1203A095-402','1203A019-000'
];

const dupes = newCodes.filter(c => codes.has(c));
const uniqueNew = [...new Set(newCodes)].filter(c => !codes.has(c));

console.log('Duplicates found:', dupes.length);
if (dupes.length > 0) console.log('Dupes:', dupes);
console.log('Unique new items:', uniqueNew.length);
