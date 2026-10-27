/**
 * Plain-language labels for the Props panel (Spanish, matching the button sample labels).
 *
 * Staff pick from a list; they should never see raw values such as "solid" or "ghost".
 * Option labels are keyed by the field's last path segment (for example `button_style`),
 * then by the stored value. A registry can also override a single option inline with
 * `string-picker:value=Label,value=Label`.
 */

/** Friendly field names, keyed by the last segment of the field path. */
export const FIELD_LABELS: Record<string, string> = {
  button_style: "Estilo del botón",
  button_variant: "Color de relleno del botón",
  text_color: "Color del texto del botón",
  photo_frame: "Marco de la foto",
  photo_frame_color: "Color del marco",
  photo_radius: "Esquinas de la foto",
  frame: "Marco de la foto",
  frame_color: "Color del marco",
  radius: "Esquinas de la foto",
  media_at_left: "Foto a la izquierda",
  bullet_icon: "Ícono de la lista",
  bullet_icon_color: "Color del ícono de la lista",
  image_alt: "Descripción de la foto",
  alt: "Descripción de la foto",
  alignment: "Alineación del texto",
  max_width: "Ancho del texto",
};

const BUTTON_LOOK: Record<string, string> = {
  primary: "Con relleno",
  secondary: "Solo texto",
  outline: "Solo contorno",
  learn_more: "Enlace con flecha",
  solid: "Con relleno",
  ghost: "Solo texto",
};

const FRAME: Record<string, string> = {
  none: "Sin marco",
  line: "Línea fina",
  glow: "Brillo suave",
};

const CORNERS: Record<string, string> = {
  none: "Rectas",
  sm: "Poco redondeadas",
  md: "Redondeadas",
  lg: "Muy redondeadas",
  full: "Totalmente redondas",
};

/** Friendly option labels, keyed by the field's last path segment. */
export const OPTION_LABELS: Record<string, Record<string, string>> = {
  button_style: BUTTON_LOOK,
  variant: BUTTON_LOOK,
  frame: FRAME,
  photo_frame: FRAME,
  radius: CORNERS,
  photo_radius: CORNERS,
};

function lastSegment(fieldPath: string): string {
  const parts = fieldPath.split(".");
  return parts[parts.length - 1] ?? fieldPath;
}

export function friendlyFieldLabel(fieldPath: string): string | undefined {
  const leaf = lastSegment(fieldPath);
  // A bare "variant" only means "button style" when it belongs to a button or CTA.
  if (leaf === "variant") return /cta|button/i.test(fieldPath) ? "Estilo del botón" : undefined;
  return FIELD_LABELS[leaf];
}

/** Split `value=Label` pairs from a string-picker option list. */
export function parseStringPickerOptions(raw: string): Array<{ value: string; label?: string }> {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf("=");
      return eq === -1
        ? { value: entry }
        : { value: entry.slice(0, eq).trim(), label: entry.slice(eq + 1).trim() };
    });
}

export function friendlyOptionLabel(fieldPath: string, value: string, inlineLabel?: string): string {
  if (inlineLabel) return inlineLabel;
  return OPTION_LABELS[lastSegment(fieldPath)]?.[value] ?? value;
}

/** Options for the button style select inside the CTA list. Keeps an unknown stored value visible. */
export function buttonLookOptions(current?: string): Array<{ value: string; label: string }> {
  const base = ["primary", "secondary", "outline"];
  if (current && !base.includes(current) && BUTTON_LOOK[current]) base.push(current);
  return base.map((value) => ({ value, label: BUTTON_LOOK[value] ?? value }));
}
