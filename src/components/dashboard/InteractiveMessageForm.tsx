import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// ─── Types ───
export interface InteractiveButton {
  type: "reply" | "url" | "copy" | "call";
  label: string;
  value: string;
}

export interface CarouselCard {
  title: string;
  image: string;
  body: string;
  buttons: InteractiveButton[];
}

export interface ListMenuItem {
  name: string;
  id: string;
  description: string;
}

export interface InteractiveData {
  footerText?: string;
  buttonText?: string;
  listButton?: string;
  choices?: string[];
  interactiveButtons?: InteractiveButton[];
  carouselCards?: CarouselCard[];
  listMenuSection?: string;
  listMenuItems?: ListMenuItem[];
  imageButton?: string;
  pixType?: string;
  pixKey?: string;
  pixName?: string;
}

// ─── Button Types ───
const BUTTON_TYPES = [
  { value: "reply", label: "💬 Resposta" },
  { value: "url", label: "🔗 URL" },
  { value: "copy", label: "📋 Copiar" },
  { value: "call", label: "📞 Ligar" },
];

function getValuePlaceholder(type: string) {
  switch (type) {
    case "url": return "https://exemplo.com";
    case "copy": return "Código ou texto para copiar";
    case "call": return "+5511988888888";
    default: return "";
  }
}

function emptyButton(): InteractiveButton {
  return { type: "reply", label: "", value: "" };
}

function emptyCard(): CarouselCard {
  return { title: "", image: "", body: "", buttons: [emptyButton()] };
}

function emptyListMenuItem(): ListMenuItem {
  return { name: "", id: "", description: "" };
}

// ─── Botões Form (up to 3 buttons) ───
function BotoesForm({
  data, onChange, compact = false,
}: {
  data: InteractiveData;
  onChange: (updates: Partial<InteractiveData>) => void;
  compact?: boolean;
}) {
  const buttons = data.interactiveButtons || [emptyButton()];

  const updateButton = (idx: number, updates: Partial<InteractiveButton>) => {
    const updated = buttons.map((b, i) => (i === idx ? { ...b, ...updates } : b));
    onChange({ interactiveButtons: updated });
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    onChange({ interactiveButtons: [...buttons, emptyButton()] });
  };

  const removeButton = (idx: number) => {
    if (buttons.length <= 1) return;
    onChange({ interactiveButtons: buttons.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : "text-sm"}>Rodapé</Label>
          <Input
            placeholder="Rodapé (opcional)"
            value={data.footerText || ""}
            onChange={(e) => onChange({ footerText: e.target.value })}
            className="bg-secondary border-border"
          />
        </div>
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : "text-sm"}>URL da Imagem</Label>
          <Input
            placeholder="https://... (opcional)"
            value={data.imageButton || ""}
            onChange={(e) => onChange({ imageButton: e.target.value })}
            className="bg-secondary border-border"
          />
        </div>
      </div>

      <Label className={compact ? "text-xs" : "text-sm"}>Botões (máx. 3)</Label>
      {buttons.map((btn, i) => (
        <div key={i} className="p-2 rounded-lg border border-border bg-background/50 space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground min-w-[50px]">Botão {i + 1}{i === 0 ? " *" : ""}</Label>
            <Select value={btn.type} onValueChange={(v) => updateButton(i, { type: v as InteractiveButton["type"], value: v === "reply" ? "" : btn.value })}>
              <SelectTrigger className="bg-secondary border-border h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUTTON_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
              </SelectContent>
            </Select>
            {i > 0 && (
              <Button variant="ghost" size="icon" onClick={() => removeButton(i)} className="h-7 w-7 shrink-0 text-destructive ml-auto">
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Texto do botão"
              value={btn.label}
              onChange={(e) => updateButton(i, { label: e.target.value })}
              className="bg-secondary border-border text-sm"
            />
            {btn.type !== "reply" && (
              <Input
                placeholder={getValuePlaceholder(btn.type)}
                value={btn.value}
                onChange={(e) => updateButton(i, { value: e.target.value })}
                className="bg-secondary border-border text-sm"
              />
            )}
          </div>
        </div>
      ))}
      {buttons.length < 3 && (
        <Button variant="outline" size="sm" onClick={addButton} className="border-border text-xs h-7">
          <Plus className="h-3 w-3 mr-1" /> Botão
        </Button>
      )}
    </div>
  );
}

// ─── Carrossel Form (up to 10 cards, 5 buttons each) ───
function CarrosselForm({
  data, onChange, compact = false,
}: {
  data: InteractiveData;
  onChange: (updates: Partial<InteractiveData>) => void;
  compact?: boolean;
}) {
  const cards = data.carouselCards || [emptyCard()];

  const updateCard = (idx: number, updates: Partial<CarouselCard>) => {
    const updated = cards.map((c, i) => (i === idx ? { ...c, ...updates } : c));
    onChange({ carouselCards: updated });
  };

  const updateCardButton = (cardIdx: number, btnIdx: number, updates: Partial<InteractiveButton>) => {
    const updated = cards.map((c, ci) => {
      if (ci !== cardIdx) return c;
      return { ...c, buttons: c.buttons.map((b, bi) => (bi === btnIdx ? { ...b, ...updates } : b)) };
    });
    onChange({ carouselCards: updated });
  };

  const addCardButton = (cardIdx: number) => {
    const card = cards[cardIdx];
    if (card.buttons.length >= 5) return;
    updateCard(cardIdx, { buttons: [...card.buttons, emptyButton()] });
  };

  const removeCardButton = (cardIdx: number, btnIdx: number) => {
    const card = cards[cardIdx];
    if (card.buttons.length <= 1) return;
    updateCard(cardIdx, { buttons: card.buttons.filter((_, i) => i !== btnIdx) });
  };

  const addCard = () => {
    if (cards.length >= 10) return;
    onChange({ carouselCards: [...cards, emptyCard()] });
  };

  const removeCard = (idx: number) => {
    if (cards.length <= 1) return;
    onChange({ carouselCards: cards.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <Label className={compact ? "text-xs" : "text-sm"}>Cards ({cards.length}/10)</Label>

      {cards.map((card, ci) => (
        <Card key={ci} className="bg-background/50 border-border">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">📄 Card {ci + 1}</span>
              {cards.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeCard(ci)} className="h-6 w-6 text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Título *</Label>
              <Input placeholder="Título do card" value={card.title} onChange={(e) => updateCard(ci, { title: e.target.value })} className="bg-secondary border-border text-sm" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Imagem *</Label>
              <Input placeholder="URL da imagem" value={card.image} onChange={(e) => updateCard(ci, { image: e.target.value })} className="bg-secondary border-border text-sm" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input placeholder="Descrição (opcional)" value={card.body} onChange={(e) => updateCard(ci, { body: e.target.value })} className="bg-secondary border-border text-sm" />
            </div>

            <Label className="text-xs">Botões (máx. 5)</Label>
            {card.buttons.map((btn, bi) => (
              <div key={bi} className="p-2 rounded border border-border bg-secondary/30 space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground min-w-[40px]">Btn {bi + 1}{bi === 0 ? "*" : ""}</Label>
                  <Select value={btn.type} onValueChange={(v) => updateCardButton(ci, bi, { type: v as InteractiveButton["type"], value: v === "reply" ? "" : btn.value })}>
                    <SelectTrigger className="bg-secondary border-border h-7 w-[110px] text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUTTON_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  {bi > 0 && (
                    <Button variant="ghost" size="icon" onClick={() => removeCardButton(ci, bi)} className="h-6 w-6 text-destructive ml-auto">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Texto do botão" value={btn.label} onChange={(e) => updateCardButton(ci, bi, { label: e.target.value })} className="bg-secondary border-border text-xs h-7" />
                  {btn.type !== "reply" && (
                    <Input placeholder={getValuePlaceholder(btn.type)} value={btn.value} onChange={(e) => updateCardButton(ci, bi, { value: e.target.value })} className="bg-secondary border-border text-xs h-7" />
                  )}
                </div>
              </div>
            ))}
            {card.buttons.length < 5 && (
              <Button variant="outline" size="sm" onClick={() => addCardButton(ci)} className="border-border text-[10px] h-6">
                <Plus className="h-3 w-3 mr-1" /> Botão
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {cards.length < 10 && (
        <Button variant="outline" onClick={addCard} className="w-full border-dashed border-primary/50 text-primary text-xs h-8">
          <Plus className="h-3 w-3 mr-1" /> Adicionar Card
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">Máximo: 10 cards, 5 botões por card</p>
    </div>
  );
}

// ─── Lista Form ───
function ListaForm({
  data, onChange, compact = false,
}: {
  data: InteractiveData;
  onChange: (updates: Partial<InteractiveData>) => void;
  compact?: boolean;
}) {
  const choices = data.choices || [""];

  const updateChoice = (idx: number, value: string) => {
    const updated = choices.map((c, i) => (i === idx ? value : c));
    onChange({ choices: updated });
  };

  const addChoice = () => onChange({ choices: [...choices, ""] });
  const removeChoice = (idx: number) => {
    if (choices.length <= 1) return;
    onChange({ choices: choices.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : "text-sm"}>Botão da Lista *</Label>
          <Input
            placeholder="Ver Categorias"
            value={data.listButton || data.buttonText || ""}
            onChange={(e) => onChange({ listButton: e.target.value, buttonText: e.target.value })}
            className="bg-secondary border-border"
          />
        </div>
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : "text-sm"}>Rodapé</Label>
          <Input
            placeholder="Rodapé (opcional)"
            value={data.footerText || ""}
            onChange={(e) => onChange({ footerText: e.target.value })}
            className="bg-secondary border-border"
          />
        </div>
      </div>

      <Label className={compact ? "text-xs" : "text-sm"}>Itens da Lista</Label>
      {choices.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={c}
            onChange={(e) => updateChoice(i, e.target.value)}
            placeholder={`Item ${i + 1}`}
            className="bg-secondary border-border"
          />
          {choices.length > 1 && (
            <Button variant="ghost" size="icon" onClick={() => removeChoice(i)} className="shrink-0 text-destructive h-8 w-8">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addChoice} className="border-border text-xs h-7">
        <Plus className="h-3 w-3 mr-1" /> Adicionar Item
      </Button>
    </div>
  );
}

// ─── Lista Menu Form ───
function ListaMenuForm({
  data, onChange, compact = false,
}: {
  data: InteractiveData;
  onChange: (updates: Partial<InteractiveData>) => void;
  compact?: boolean;
}) {
  const items = data.listMenuItems || [emptyListMenuItem()];

  const updateItem = (idx: number, updates: Partial<ListMenuItem>) => {
    const updated = items.map((item, i) => (i === idx ? { ...item, ...updates } : item));
    onChange({ listMenuItems: updated });
  };

  const addItem = () => onChange({ listMenuItems: [...items, emptyListMenuItem()] });
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    onChange({ listMenuItems: items.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : "text-sm"}>Botão da Lista *</Label>
          <Input
            placeholder="Ver opções"
            value={data.buttonText || ""}
            onChange={(e) => onChange({ buttonText: e.target.value })}
            className="bg-secondary border-border"
          />
        </div>
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : "text-sm"}>Rodapé</Label>
          <Input
            placeholder="Rodapé (opcional)"
            value={data.footerText || ""}
            onChange={(e) => onChange({ footerText: e.target.value })}
            className="bg-secondary border-border"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className={compact ? "text-xs" : "text-sm"}>Nome da Seção *</Label>
        <Input
          placeholder="Nome da seção"
          value={data.listMenuSection || ""}
          onChange={(e) => onChange({ listMenuSection: e.target.value })}
          className="bg-secondary border-border"
        />
      </div>

      <Label className={compact ? "text-xs" : "text-sm"}>Itens do Menu</Label>
      {items.map((item, i) => (
        <div key={i} className="p-2 rounded border border-border bg-background/50 space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground">Item {i + 1}{i === 0 ? " *" : ""}</Label>
            {items.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeItem(i)} className="h-6 w-6 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Nome" value={item.name} onChange={(e) => updateItem(i, { name: e.target.value })} className="bg-secondary border-border text-xs h-7" />
            <Input placeholder="ID" value={item.id} onChange={(e) => updateItem(i, { id: e.target.value })} className="bg-secondary border-border text-xs h-7" />
            <Input placeholder="Descrição" value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} className="bg-secondary border-border text-xs h-7" />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem} className="border-border text-xs h-7">
        <Plus className="h-3 w-3 mr-1" /> Adicionar Item
      </Button>
    </div>
  );
}

// ─── Enquete Form ───
function EnqueteForm({
  data, onChange, compact = false,
}: {
  data: InteractiveData;
  onChange: (updates: Partial<InteractiveData>) => void;
  compact?: boolean;
}) {
  const choices = data.choices || ["", ""];

  const updateChoice = (idx: number, value: string) => {
    const updated = choices.map((c, i) => (i === idx ? value : c));
    onChange({ choices: updated });
  };

  const addChoice = () => onChange({ choices: [...choices, ""] });
  const removeChoice = (idx: number) => {
    if (choices.length <= 2) return;
    onChange({ choices: choices.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <Label className={compact ? "text-xs" : "text-sm"}>Opções da Enquete</Label>
      {choices.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={c}
            onChange={(e) => updateChoice(i, e.target.value)}
            placeholder={`Opção ${i + 1}${i < 2 ? " *" : ""}`}
            className="bg-secondary border-border"
          />
          {choices.length > 2 && (
            <Button variant="ghost" size="icon" onClick={() => removeChoice(i)} className="shrink-0 text-destructive h-8 w-8">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addChoice} className="border-border text-xs h-7">
        <Plus className="h-3 w-3 mr-1" /> Adicionar Opção
      </Button>
    </div>
  );
}

// ─── Main Exported Component ───
interface InteractiveMessageFormProps {
  messageType: string;
  data: InteractiveData;
  onChange: (updates: Partial<InteractiveData>) => void;
  compact?: boolean;
}

export function InteractiveMessageForm({ messageType, data, onChange, compact = false }: InteractiveMessageFormProps) {
  switch (messageType) {
    case "button":
      return <BotoesForm data={data} onChange={onChange} compact={compact} />;
    case "carousel":
      return <CarrosselForm data={data} onChange={onChange} compact={compact} />;
    case "list":
      return <ListaForm data={data} onChange={onChange} compact={compact} />;
    case "poll":
      return <EnqueteForm data={data} onChange={onChange} compact={compact} />;
    default:
      return null;
  }
}

// ─── Helper: build command string from InteractiveData (for API payload) ───
export function buildInteractivePayload(messageType: string, data: InteractiveData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (data.footerText) payload.footerText = data.footerText;

  switch (messageType) {
    case "button": {
      const buttons = (data.interactiveButtons || []).filter((b) => b.label.trim());
      if (buttons.length > 0) {
        payload.buttons = buttons.map((b) => {
          if (b.type === "url") return { type: "url", title: b.label, url: b.value };
          if (b.type === "copy") return { type: "copy", title: b.label, copyCode: b.value };
          if (b.type === "call") return { type: "call", title: b.label, phoneNumber: b.value };
          return { type: "reply", title: b.label };
        });
        // Also send as choices for backward compat
        payload.choices = buttons.map((b) => {
          if (b.type === "url") return `${b.label}|${b.value}`;
          if (b.type === "copy") return `${b.label}|copy:${b.value}`;
          if (b.type === "call") return `${b.label}|call:${b.value}`;
          return b.label;
        });
      }
      if (data.buttonText) payload.buttonText = data.buttonText;
      if (data.imageButton) payload.imageButton = data.imageButton;
      break;
    }
    case "carousel": {
      const cards = (data.carouselCards || []).filter((c) => c.title.trim());
      if (cards.length > 0) {
        payload.cards = cards.map((c) => ({
          title: c.title,
          body: c.body || undefined,
          image: c.image,
          buttons: c.buttons.filter((b) => b.label.trim()).map((b) => {
            if (b.type === "url") return { type: "url", title: b.label, url: b.value };
            if (b.type === "copy") return { type: "copy", title: b.label, copyCode: b.value };
            if (b.type === "call") return { type: "call", title: b.label, phoneNumber: b.value };
            return { type: "reply", title: b.label };
          }),
        }));
        // Also build choices for backward compat
        payload.choices = cards.map((c) => {
          const btns = c.buttons.filter((b) => b.label.trim()).map((b) => {
            if (b.type === "url") return `${b.label}|${b.value}`;
            if (b.type === "copy") return `${b.label}|copy:${b.value}`;
            if (b.type === "call") return `${b.label}|call:${b.value}`;
            return b.label;
          });
          return `[${c.title}${c.body ? "\\n" + c.body : ""}],${c.image},${btns.join(",")}`;
        });
      }
      break;
    }
    case "list": {
      if (data.listButton || data.buttonText) payload.buttonText = data.listButton || data.buttonText;
      if (data.listButton) payload.listButton = data.listButton;
      const items = (data.choices || []).filter(Boolean);
      if (items.length > 0) payload.choices = items;
      break;
    }
    case "poll": {
      const opts = (data.choices || []).filter(Boolean);
      if (opts.length > 0) payload.choices = opts;
      break;
    }
  }

  return payload;
}
