import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/modules/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        // xs cubre celulares estrechos (iPhone SE 1st gen = 320, mayoría
        // moderna ≥ 375). Sirve para mostrar/ocultar elementos del top bar.
        xs: '380px',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        sidebar: 'hsl(var(--sidebar))',
        // Escala de SEVERIDAD, no de estados de pedido: sirve igual para
        // «en preparación» en el KDS que para «lote por vencer» en almacén.
        // Con <alpha-value> para poder escribir `bg-senal-ok/10` sin recurrir
        // a la paleta cruda de Tailwind.
        //
        // Son para TEXTO, BORDES y TINTES: sus valores están oscurecidos en
        // tema claro para cumplir AA. Para rellenos sólidos con texto blanco
        // encima siguen estando --success, --warning y --destructive.
        senal: {
          aviso: 'hsl(var(--senal-aviso) / <alpha-value>)',
          curso: 'hsl(var(--senal-curso) / <alpha-value>)',
          ok: 'hsl(var(--senal-ok) / <alpha-value>)',
          critico: 'hsl(var(--senal-critico) / <alpha-value>)',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      fontFamily: {
        sans: ['var(--font-onest)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Geist Mono se queda: sus cifras tabulares son las que impiden que el
        // cronómetro del KDS baile cada segundo.
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
      },
      // Escala tipográfica fluida (Dynamic Type). Todo en rem + clamp: sobrevive
      // al zoom del navegador al 200 % y a la preferencia de tamaño del sistema.
      // El mínimo de `body` es 1rem porque el KDS se lee a un brazo de distancia.
      fontSize: {
        caption: ['clamp(0.8125rem, 0.79rem + 0.12vw, 0.875rem)', { lineHeight: '1.35' }],
        body: ['clamp(1rem, 0.97rem + 0.15vw, 1.0625rem)', { lineHeight: '1.5' }],
        headline: ['clamp(1.0625rem, 1rem + 0.3vw, 1.25rem)', { lineHeight: '1.35' }],
        title: ['clamp(1.25rem, 1.12rem + 0.6vw, 1.625rem)', { lineHeight: '1.25' }],
        display: ['clamp(1.75rem, 1.45rem + 1.4vw, 2.75rem)', { lineHeight: '1.1' }],
        // El cronómetro es el dato que se lee desde lejos y de reojo.
        timer: [
          'clamp(2rem, 1.5rem + 2.4vw, 3.5rem)',
          { lineHeight: '1', letterSpacing: '-0.02em' },
        ],
      },
      transitionTimingFunction: {
        smooth: 'var(--ease-smooth)',
        snappy: 'var(--ease-snappy)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        // Solo compone opacidad; ver la nota en globals.css.
        atencion: 'atencion 1.8s var(--ease-smooth) infinite',
      },
    },
  },
  plugins: [animate],
};

export default config;
