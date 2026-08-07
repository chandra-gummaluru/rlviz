// Canvas font loading for p5. DOM text loads the same font files via @font-face in style.css;
// see libraries/fonts/README.md. Domain files must NOT reference this file.

const Typography = {
    fonts: {
        sansRegular:  null,
        sansMedium:   null,
        sansSemibold: null,
        monoRegular:  null,
        monoMedium:   null,
        mathItalic:   null
    },
    FALLBACK_SANS: 'Calibri, "Segoe UI", Tahoma, sans-serif',
    FALLBACK_MONO: 'Consolas, monospace',
    FALLBACK_MATH: 'italic Georgia, serif',

    preload() {
        this.fonts.sansRegular  = loadFont('libraries/fonts/IBMPlexSans-Regular.ttf');
        this.fonts.sansMedium   = loadFont('libraries/fonts/IBMPlexSans-Medium.ttf');
        this.fonts.sansSemibold = loadFont('libraries/fonts/IBMPlexSans-SemiBold.ttf');
        this.fonts.monoRegular  = loadFont('libraries/fonts/IBMPlexMono-Regular.ttf');
        this.fonts.monoMedium   = loadFont('libraries/fonts/IBMPlexMono-Medium.ttf');
        this.fonts.mathItalic   = loadFont('libraries/fonts/STIXTwoText-Italic.ttf');
    },

    sans(weight) {
        if (weight === 'medium') return this.fonts.sansMedium || this.FALLBACK_SANS;
        if (weight === 'semibold') return this.fonts.sansSemibold || this.FALLBACK_SANS;
        return this.fonts.sansRegular || this.FALLBACK_SANS;
    },

    mono(weight) {
        if (weight === 'medium') return this.fonts.monoMedium || this.FALLBACK_MONO;
        return this.fonts.monoRegular || this.FALLBACK_MONO;
    },

    math() {
        return this.fonts.mathItalic || this.FALLBACK_MATH;
    }
};
