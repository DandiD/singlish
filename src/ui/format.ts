// I numeri con il punto delle migliaia anche sotto 10.000 («4.300»): in italiano Intl lo omette.
const intFmt = new Intl.NumberFormat('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions)
export const formatNumber = (n: number): string => intFmt.format(n)
