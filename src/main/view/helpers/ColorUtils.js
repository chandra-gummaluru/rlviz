// Converts any color value to rgba() with the given alpha (0-255).
// Handles p5.js color objects, rgb(), rgba(), hsl(), hsla(), #RRGGBB, and #RGB strings.
// Depends on p5.js globals: red(), green(), blue().
class ColorUtils {
    static applyAlpha(c, alpha) {
        if (alpha >= 255) return c;

        if (typeof c === 'object' && c !== null && typeof c.levels !== 'undefined') {
            const r = red(c);
            const g = green(c);
            const b = blue(c);
            return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${(alpha / 255).toFixed(2)})`;
        }

        if (typeof c !== 'string') return c;

        const rgbMatch = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
        if (rgbMatch) {
            return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${(alpha / 255).toFixed(2)})`;
        }

        const rgbaMatch = c.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/);
        if (rgbaMatch) {
            return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${(alpha / 255).toFixed(2)})`;
        }

        const hslMatch = c.match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/);
        if (hslMatch) {
            return `hsla(${hslMatch[1]}, ${hslMatch[2]}%, ${hslMatch[3]}%, ${(alpha / 255).toFixed(2)})`;
        }

        const hslaMatch = c.match(/^hsla\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*[\d.]+\s*\)$/);
        if (hslaMatch) {
            return `hsla(${hslaMatch[1]}, ${hslaMatch[2]}%, ${hslaMatch[3]}%, ${(alpha / 255).toFixed(2)})`;
        }

        const hexMatch = c.match(/^#([0-9a-fA-F]{3,6})$/);
        if (hexMatch) {
            let hex = hexMatch[1];
            if (hex.length === 3) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${(alpha / 255).toFixed(2)})`;
        }

        return c;
    }

    // Picks a light or dark label color that stays readable against a given fill color,
    // so node labels stay legible as node fill colors change with theme/palette tuning.
    static contrastText(c) {
        let r, g, b;
        if (typeof c === 'object' && c !== null && typeof c.levels !== 'undefined') {
            r = red(c); g = green(c); b = blue(c);
        } else if (typeof c === 'string') {
            const hexMatch = c.match(/^#([0-9a-fA-F]{3,6})$/);
            if (hexMatch) {
                let hex = hexMatch[1];
                if (hex.length === 3) {
                    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
                }
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            } else {
                const rgbMatch = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
                if (rgbMatch) {
                    r = parseInt(rgbMatch[1], 10);
                    g = parseInt(rgbMatch[2], 10);
                    b = parseInt(rgbMatch[3], 10);
                }
            }
        }
        if (r === undefined) return '#FFFFFF';
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6 ? '#1a1a1a' : '#FFFFFF';
    }
}
