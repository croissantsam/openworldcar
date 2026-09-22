/**
 * Touch-controls + orientation-prompt strings (`touch_` / `orient_` prefix):
 * every visible label on the joystick, fire / nitro / brake buttons and the
 * rotate-screen overlay. Arrows (▲▼) stay universal inside the templates.
 * Convention: `fr` is the reference (exact current French copy); `en`/`es`
 * are typed as `typeof fr` so a missing or extra key fails typecheck.
 * NOTE: no `as const` here — with `as const`, `typeof fr` would freeze the
 * French values as literal types and every translated value would fail
 * typecheck. Without it, values widen to `string` while keys stay exact.
 */

export const fr = {
  touch_stick_hint: '▲ PIQUER · ▼ CABRER',
  touch_fire_label: 'Mitrailleuse',
  touch_fire: 'TIR',
  touch_nitro: 'NITRO',
  touch_brake: 'FREIN',
  touch_throttle_zero: 'GAZ 0',
  orient_title: 'PIVOTEZ VOTRE ÉCRAN',
  orient_sub_before:
    'Pour une expérience de pilotage optimale avec les commandes à deux pouces, veuillez tourner votre appareil en mode',
  orient_mode: 'horizontal (paysage)',
  orient_fullscreen: 'PLEIN ÉCRAN',
  orient_continue: 'Continuer quand même',
}

export type TouchDict = typeof fr

export const en: TouchDict = {
  touch_stick_hint: '▲ DIVE · ▼ PULL UP',
  touch_fire_label: 'Machine gun',
  touch_fire: 'FIRE',
  touch_nitro: 'NITRO',
  touch_brake: 'BRAKE',
  touch_throttle_zero: 'THR 0',
  orient_title: 'ROTATE YOUR SCREEN',
  orient_sub_before:
    'For the best two-thumb driving experience, please turn your device to',
  orient_mode: 'landscape mode',
  orient_fullscreen: 'FULL SCREEN',
  orient_continue: 'Continue anyway',
}

export const es: TouchDict = {
  touch_stick_hint: '▲ PICAR · ▼ ASCENDER',
  touch_fire_label: 'Ametralladora',
  touch_fire: 'FUEGO',
  touch_nitro: 'NITRO',
  touch_brake: 'FRENO',
  touch_throttle_zero: 'GAS 0',
  orient_title: 'GIRA TU PANTALLA',
  orient_sub_before:
    'Para una experiencia de conducción óptima con los controles de dos pulgares, gire su dispositivo al modo',
  orient_mode: 'horizontal (apaisado)',
  orient_fullscreen: 'PANTALLA COMPLETA',
  orient_continue: 'Continuar de todos modos',
}
