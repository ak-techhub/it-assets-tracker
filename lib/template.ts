import * as XLSX from 'xlsx';

export function downloadTemplate(): void {
  const sampleRows = [
    {
      'Opened':               '2026-04-10',
      'Updated':              '2026-04-10',
      'Requested for':        'John Smith',
      'Request':              'REQ0079403',
      'Number':               'RITM0043953',
      'Item':                 'Logitech MX Keys for Mac',
      'Quantity':             1,
      'Assigned to':          'Shyam Sunder Radhakrishnan',
      'Assignment group':     'Deskside Support APJ',
      'State':                'Work in Progress',
      'Approval':             'Approved',
      'Short description':    'Logitech MX Keys for Mac for John Smith - Bangalore',
      'Description':          'Request For : John Smith\r\n\r\nDelivery Information : John Smith\r\n#123, Example Layout, Example Road, Bengaluru - 560001\r\nPhone number - +91 9876543210',
      'Close notes':          '',
      'Comments and Work notes': '',
    },
    {
      'Opened':               '2026-04-10',
      'Updated':              '2026-04-10',
      'Requested for':        'John Smith',
      'Request':              'REQ0079402',
      'Number':               'RITM0043952',
      'Item':                 'Standard Laptop Stand',
      'Quantity':             1,
      'Assigned to':          'Shyam Sunder Radhakrishnan',
      'Assignment group':     'Deskside Support APJ',
      'State':                'Work in Progress',
      'Approval':             'Approved',
      'Short description':    'Standard Laptop Stand for John Smith - Bangalore',
      'Description':          'Request For : John Smith\r\n\r\nDelivery Information : John Smith\r\n#123, Example Layout, Example Road, Bengaluru - 560001\r\nPhone number - +91 9876543210',
      'Close notes':          '',
      'Comments and Work notes': '',
    },
    {
      'Opened':               '2026-04-11',
      'Updated':              '2026-04-11',
      'Requested for':        'Jane Doe',
      'Request':              'REQ0079300',
      'Number':               'RITM0043800',
      'Item':                 'Apple Mac Wireless Mouse',
      'Quantity':             1,
      'Assigned to':          'Shyam Sunder Radhakrishnan',
      'Assignment group':     'Deskside Support APJ',
      'State':                'Closed Complete',
      'Approval':             'Approved',
      'Short description':    'Apple Mac Wireless Mouse for Jane Doe - Mumbai',
      'Description':          'Request For : Jane Doe\r\n\r\nDelivery Information : Jane Doe\r\nFlat 5B, Example Apartments, Link Road, Mumbai - 400001\r\nPhone number - +91 9876500000',
      'Close notes':          'Delivered',
      'Comments and Work notes': '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Page 1');
  XLSX.writeFile(wb, 'sc_req_item_template.xlsx');
}
