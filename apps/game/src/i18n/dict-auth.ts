/**
 * Auth modal strings (`auth_` prefix).
 * Convention: `fr` is the reference (exact current French copy); `en`/`es`
 * are typed as `typeof fr` so a missing or extra key fails typecheck.
 * NOTE: no `as const` here — with `as const`, `typeof fr` would freeze the
 * French values as literal types and every translated value would fail
 * typecheck. Without it, values widen to `string` while keys stay exact.
 */

export const fr = {
  auth_title: 'COMPTE PILOTE',
  auth_session_loading: 'Chargement de la session…',
  auth_guest_hint_lead: 'Mode invité',
  auth_guest_hint_rest: ' — ton spawn et tes réglages sont sauvegardés. Crée un compte pour les retrouver sur tous tes appareils.',
  auth_tab_signup: 'CRÉER UN COMPTE',
  auth_tab_login: 'SE CONNECTER',
  auth_label_name: 'Pseudo',
  auth_name_placeholder: 'Ex : SpeedRacer',
  auth_label_email: 'Email',
  auth_email_placeholder: 'pilote@exemple.fr',
  auth_label_password: 'Mot de passe (8 caractères min)',
  auth_err_name_short: 'Choisis un pseudo (2 caractères min).',
  auth_err_signup: 'Inscription impossible.',
  auth_err_login: 'Connexion impossible.',
  auth_err_generic: 'Une erreur est survenue.',
  auth_submit_signup: 'CRÉER MON COMPTE',
  auth_submit_login: 'SE CONNECTER',
  auth_connected_lead: 'Connecté',
  auth_connected_rest: ' — spawn et réglages synchronisés sur ton compte.',
  auth_label_driver_name: 'Pseudo pilote',
  auth_logout: 'Se déconnecter (retour invité)',
}

export type AuthDict = typeof fr

export const en: AuthDict = {
  auth_title: 'DRIVER ACCOUNT',
  auth_session_loading: 'Loading session…',
  auth_guest_hint_lead: 'Guest mode',
  auth_guest_hint_rest: ' — your spawn and settings are saved. Create an account to find them on all your devices.',
  auth_tab_signup: 'CREATE ACCOUNT',
  auth_tab_login: 'SIGN IN',
  auth_label_name: 'Nickname',
  auth_name_placeholder: 'E.g.: SpeedRacer',
  auth_label_email: 'Email',
  auth_email_placeholder: 'driver@example.com',
  auth_label_password: 'Password (8 characters min)',
  auth_err_name_short: 'Pick a nickname (2 characters min).',
  auth_err_signup: 'Sign-up failed.',
  auth_err_login: 'Sign-in failed.',
  auth_err_generic: 'Something went wrong.',
  auth_submit_signup: 'CREATE MY ACCOUNT',
  auth_submit_login: 'SIGN IN',
  auth_connected_lead: 'Signed in',
  auth_connected_rest: ' — spawn and settings synced to your account.',
  auth_label_driver_name: 'Driver nickname',
  auth_logout: 'Sign out (back to guest)',
}

export const es: AuthDict = {
  auth_title: 'CUENTA DE PILOTO',
  auth_session_loading: 'Cargando la sesión…',
  auth_guest_hint_lead: 'Modo invitado',
  auth_guest_hint_rest: ' — tu spawn y tus ajustes están guardados. Crea una cuenta para recuperarlos en todos tus dispositivos.',
  auth_tab_signup: 'CREAR UNA CUENTA',
  auth_tab_login: 'INICIAR SESIÓN',
  auth_label_name: 'Apodo',
  auth_name_placeholder: 'Ej.: SpeedRacer',
  auth_label_email: 'Email',
  auth_email_placeholder: 'piloto@ejemplo.es',
  auth_label_password: 'Contraseña (8 caracteres mín.)',
  auth_err_name_short: 'Elige un apodo (2 caracteres mín.).',
  auth_err_signup: 'Registro imposible.',
  auth_err_login: 'Inicio de sesión imposible.',
  auth_err_generic: 'Se ha producido un error.',
  auth_submit_signup: 'CREAR MI CUENTA',
  auth_submit_login: 'INICIAR SESIÓN',
  auth_connected_lead: 'Sesión iniciada',
  auth_connected_rest: ' — spawn y ajustes sincronizados con tu cuenta.',
  auth_label_driver_name: 'Apodo de piloto',
  auth_logout: 'Cerrar sesión (volver a invitado)',
}
