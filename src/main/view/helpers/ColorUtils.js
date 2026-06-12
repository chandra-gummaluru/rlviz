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
}
