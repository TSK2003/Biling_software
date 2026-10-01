let globalCurrencySymbol = '₹';

export function setGlobalCurrencySymbol(symbol: string) {
  if (symbol && symbol.trim()) {
    globalCurrencySymbol = symbol.trim();
  }
}

export function getGlobalCurrencySymbol(): string {
  return globalCurrencySymbol;
}

/**
 * Formats an amount in paise to currency format using configured currency symbol (e.g. 15000 paise -> "₹150.00" or "$150.00")
 */
export function formatCurrency(paise: number, customSymbol?: string): string {
  const sym = customSymbol !== undefined ? customSymbol : globalCurrencySymbol;
  const val = (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${val}`;
}

/**
 * Formats paise to decimal number string without currency symbol (e.g. 15000 -> "150.00")
 */
export function paiseToRupeesStr(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Converts rupee decimal string or number to integer paise (e.g. "150.50" -> 15050)
 */
export function rupeesToPaise(rupees: number | string): number {
  const val = typeof rupees === 'string' ? parseFloat(rupees) || 0 : rupees;
  return Math.round(val * 100);
}

/**
 * Formats date string (YYYY-MM-DD) to Indian DD-MM-YYYY format (e.g. "2026-09-28" -> "28-09-2026")
 */
export function formatDateDMY(dateStr: string, separator: string = '-'): string {
  if (!dateStr) return '';
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}${separator}${parts[1]}${separator}${parts[0]}`;
  }
  return dateStr;
}

/**
 * Formats date string (YYYY-MM-DD) to readable format (e.g. "28-09-2026")
 */
export function formatDate(dateStr: string): string {
  return formatDateDMY(dateStr);
}

/**
 * Formats ISO timestamp to date + time (e.g. "20 Aug 2026, 10:30 AM")
 */
export function formatDateTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoStr;
  }
}

/**
 * Gets today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts paise to Indian Rupee amount in words (e.g. 70035 -> "Rupees Seven Hundred and Thirty-Five Paise Only")
 */
export function amountInWordsINR(paise: number): string {
  const totalRupees = Math.floor(paise / 100);
  const remainingPaise = Math.round(paise % 100);

  if (totalRupees === 0 && remainingPaise === 0) return 'Rupees Zero Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function numToWords(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + (n % 10 !== 0 ? ones[n % 10] + ' ' : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + numToWords(n % 100);
    if (n < 100000) return numToWords(Math.floor(n / 1000)) + 'Thousand ' + numToWords(n % 1000);
    if (n < 10000000) return numToWords(Math.floor(n / 100000)) + 'Lakh ' + numToWords(n % 100000);
    return numToWords(Math.floor(n / 10000000)) + 'Crore ' + numToWords(n % 10000000);
  }

  let words = 'Rupees ';
  if (totalRupees > 0) {
    words += numToWords(totalRupees).trim();
  } else {
    words += 'Zero';
  }

  if (remainingPaise > 0) {
    words += ' and ' + numToWords(remainingPaise).trim() + ' Paise';
  }

  return words + ' Only';
}
