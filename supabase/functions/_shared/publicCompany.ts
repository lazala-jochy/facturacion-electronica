// Mismo mapeo que publicCompany() en backend/src/services/auth.service.ts --
// si uno cambia, el otro tiene que cambiar igual, o login/register devuelven
// una empresa incompleta y el frontend guarda una sesion con campos faltantes
// (asi se detecto este bug: las URLs de DGII salian vacias tras login).
import { decryptAppSecret } from "./crypto.ts";

// deno-lint-ignore no-explicit-any
export const toPublicCompany = (c: Record<string, any>, appSecretsKey: string) => ({
  id: c.id,
  name: c.name,
  rnc: c.rnc,
  address: c.address,
  phone: c.phone,
  email: c.email,
  logoUrl: c.logo_url,
  signatureUrl: c.signature_url,
  dgiiEcfEndpoint: c.dgii_ecf_endpoint,
  dgiiUsername: c.dgii_username,
  dgiiPassword: decryptAppSecret(c.dgii_password_enc, appSecretsKey),
  dgiiAuthUrl: c.dgii_auth_url,
  dgiiReceptionUrl: c.dgii_reception_url,
  dgiiConsultUrl: c.dgii_consult_url,
  dgiiCommercialApprovalUrl: c.dgii_commercial_approval_url,
  dgiiSeedUrl: c.dgii_seed_url,
  dgiiValidateSeedUrl: c.dgii_validate_seed_url,
  dgiiEcfReceiveUrl: c.dgii_ecf_receive_url,
  dgiiTrackUrl: c.dgii_track_url,
  dgiiStatusUrl: c.dgii_status_url,
  dgiiEnvironment: c.dgii_environment,
  dgiiProdAuthUrl: c.dgii_prod_auth_url,
  dgiiProdSeedUrl: c.dgii_prod_seed_url,
  dgiiProdValidateSeedUrl: c.dgii_prod_validate_seed_url,
  dgiiProdReceptionUrl: c.dgii_prod_reception_url,
  dgiiProdConsultUrl: c.dgii_prod_consult_url,
  dgiiProdCommercialApprovalUrl: c.dgii_prod_commercial_approval_url,
  dgiiProdConsumerSummaryUrl: c.dgii_prod_consumer_summary_url,
  dgiiPaso4AuthUrl: c.dgii_paso4_auth_url,
  dgiiPaso4ReceptionUrl: c.dgii_paso4_reception_url,
  dgiiPaso4ConsultUrl: c.dgii_paso4_consult_url,
  dgiiPaso4RfceUrl: c.dgii_paso4_rfce_url,
  dgiiPaso4Environment: c.dgii_paso4_environment,
  dgiiPaso4SeedUrl: c.dgii_paso4_seed_url,
  dgiiPaso4ValidateSeedUrl: c.dgii_paso4_validate_seed_url,
  dgiiPaso4EcfReceiveUrl: c.dgii_paso4_ecf_receive_url,
  ecfGatewayBaseUrl: c.ecf_gateway_base_url,
  ecfGatewayApiKey: c.ecf_gateway_api_key,
  smtpEmail: c.smtp_email,
  certificatePath: c.certificate_path,
  tokenExpiration: c.token_expiration,
  certificateConfigured: Boolean(c.certificate_salt && c.certificate_enc_path && c.certificate_password_enc),
  certificate_keyphrase: decryptAppSecret(c.certificate_keyphrase_enc, appSecretsKey),
  token_cached: Boolean(
    c.token_cache &&
      c.token_expiration &&
      c.token_cache_environment === (c.dgii_environment ?? "CERTIFICACION") &&
      new Date(c.token_expiration).getTime() > Date.now(),
  ),
  app_secrets_key_configured: Boolean(c.app_secrets_key_enc),
  // Igual que certificate_keyphrase: se manda ya en claro para precargar el campo en Perfil de
  // empresa (si no, hay que volver a tipearla a mano en cada guardado aunque dejarla vacía ya
  // conserve la actual).
  app_secrets_key: appSecretsKey,
  smtp_app_password_configured: Boolean(c.smtp_app_password_enc),
  smtp_app_password: decryptAppSecret(c.smtp_app_password_enc, appSecretsKey),
});
