# Integraciones

## Maasy: el conocimiento de marca

Cada cuenta de Instagram puede vincularse a una marca de Maasy (`InstagramAccount.maasyProjectId`).

- **Cómo se conecta:** `lib/maasy/brand.ts` llama al MCP de Maasy (`https://mcp.maasy.ai`) con el header `x-api-key` y la variable `MAASY_MCP_API_KEY`. Con `Authorization: Bearer` responde "Invalid OAuth token".
- **Qué trae:** `maasy_list_brands` para el selector y `maasy_get_brand_dna` para el ADN. Toma solo los campos llenos.
- **Cómo lo resume:** BeGateway, tier `believe-smart`, a una ficha de hasta 12.000 caracteres. La guarda en `knowledgeBase` y marca `maasySyncedAt`.
- **Cuándo:** al vincular, con **Sync now** y en el cron diario `sync-maasy`.
- **Por qué no consulta en vivo:** el ADN pesa de 50.000 a 110.000 caracteres por marca. Mandarlo en cada DM costaría de 15.000 a 30.000 tokens por mensaje, y el DM dependería de que Maasy esté arriba.

Las marcas que operan hoy en Maasy: Believe, Maasy IA, Believable, MAAS 90D, Villa Elcira, Uniplaza, WAW Trips y ON!, todas con el ADN cargado.

## BeGateway: la IA

Toda llamada a un modelo pasa por `llm.believe-global.com` (compatible con OpenAI), con la llave propia `LLM_GATEWAY_KEY_BEREPLY`. Las respuestas de DM usan el tier `believe-fast` y el resumen de Maasy usa `believe-smart`. BeReply nunca tiene una llave directa de un proveedor.

## BeCommerce: catálogo y pedidos

- **Catálogo:** el bloque *Show products* llama a `mcp.becommerce.believe-global.com` (`search_products`) con el slug de la tienda configurado en **Settings → Ecommerce integration**. Solo muestra productos que la tienda marcó como comprables por agente.
- **Pedidos:** la tienda manda sus eventos de pedido a `/api/webhooks/ecommerce`, firmados con el secreto que genera BeReply. Un pedido que llega desde un link de BeReply (`bc_ref`) queda asociado al contacto.

## Meta

Webhooks entrantes en `/api/webhook` y la Graph API de Instagram para enviar. Detalle en *La app de Meta*.
