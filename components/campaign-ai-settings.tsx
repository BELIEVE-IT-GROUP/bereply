"use client";

/**
 * Campaign AI Settings
 *
 * Toggle + brand system prompt for the AI auto-responder (lib/ai/responder.ts).
 * Controlled component — no fetch, no persistence. The caller owns state and
 * saving; this just reports the next { aiEnabled, aiConfig } on every change.
 */

interface AiConfig {
  systemPrompt?: string;
}

interface CampaignAiSettingsProps {
  aiEnabled: boolean;
  aiConfig: AiConfig | null;
  onChange: (next: {
    aiEnabled: boolean;
    aiConfig: { systemPrompt: string } | null;
  }) => void;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-accent" : "bg-zinc-300"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export default function CampaignAiSettings({
  aiEnabled,
  aiConfig,
  onChange,
}: CampaignAiSettingsProps) {
  const systemPrompt = aiConfig?.systemPrompt ?? "";

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">AI</h2>
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-foreground">Responder con IA</span>
            <p className="mt-0.5 text-xs text-muted">
              Genera cada respuesta con IA en base a la conversación, en vez de
              enviar siempre el mismo mensaje.
            </p>
          </div>
          <Toggle
            on={aiEnabled}
            onToggle={() =>
              onChange({
                aiEnabled: !aiEnabled,
                aiConfig: { systemPrompt },
              })
            }
          />
        </div>
        {aiEnabled && (
          <div className="mt-3 space-y-1">
            <textarea
              value={systemPrompt}
              onChange={(e) =>
                onChange({
                  aiEnabled,
                  aiConfig: { systemPrompt: e.target.value },
                })
              }
              placeholder="Sos el asistente de @marca. Tono cercano, nunca prometas descuentos."
              rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none resize-none"
              maxLength={2000}
            />
            <p className="text-xs text-muted">
              Se suma a las reglas de seguridad fijas (nunca inventa precios,
              stock o envíos; escala a un humano ante quejas o dudas).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
