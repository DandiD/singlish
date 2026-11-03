/**
 * Ref per i campi in cui si scrive inglese esatto: niente correzione automatica né controllo ortografico.
 * Preact passa `autocorrect` e `spellcheck` come proprietà; in Chrome sono booleane e la stringa "off"
 * diventa "on", mentre altrove (proprietà assente) `false` toglie l'attributo. Gli attributi valgono ovunque.
 */
export function noAutocorrect(el: HTMLElement | null): void {
  el?.setAttribute('autocorrect', 'off')
  el?.setAttribute('spellcheck', 'false')
}
