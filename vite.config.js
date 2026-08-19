import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        // Statically inlined at build time so credentials are available
        // regardless of output format (import.meta.env doesn't survive the
        // IIFE build used for Android WebView compatibility below).
        define: {
            __SUPABASE_URL__: JSON.stringify(env.VITE_SUPABASE_URL || ''),
            __SUPABASE_ANON_KEY__: JSON.stringify(env.VITE_SUPABASE_ANON_KEY || '')
        },
        // Default to the production website root. If someone needs a sub-path or
        // Android WebView build, set VITE_BASE_PATH=./ explicitly in the env.
        base: env.VITE_BASE_PATH || '/',
        plugins: [
            viteStaticCopy({
                targets: [
                    {
                        // Copy only HTML/CSS templates (fetched at runtime as raw text).
                        // JS files are intentionally excluded: they're already bundled by
                        // Rollup via the eager import.meta.glob in core/router.js, and this
                        // plugin's dev-mode static-serve middleware would otherwise shadow
                        // Vite's module transform for any .js file it matches, breaking
                        // bare imports (e.g. 'xlsx', '@supabase/supabase-js') in dev.
                        src: 'pages/**/*.{html,css}',
                        dest: '.'
                    }
                ]
            }),
            {
                // Vite always marks the entry script as type="module" even when
                // Rollup emits it as a classic IIFE. Old Android WebViews ignore
                // <script type="module"> entirely (no error, just a blank screen),
                // so strip it here to keep the script a plain classic script.
                // IMPORTANT: replace with `defer`, not just remove — Vite also
                // injects this script tag into <head>, and ES modules are
                // deferred by spec. Dropping type="module" without adding
                // `defer` turns it into a blocking script that runs before
                // <body> exists, breaking any top-level DOM access (blank
                // white screen on every real device/browser hitting the URL).
                // Build-only: the dev server still needs real ES modules for HMR.
                name: 'strip-module-script-type',
                apply: 'build',
                transformIndexHtml: {
                    order: 'post',
                    handler(html) {
                        return html
                            .replace(/\s+type="module"/g, ' defer')
                            .replace(/\s+crossorigin(?=[\s>])/g, '');
                    }
                }
            }
        ],
        build: {
            // Ensure source maps are disabled for a clean production build
            sourcemap: false,
            // Some Android devices ship an old system WebView that silently
            // ignores <script type="module"> (no error, just a blank white
            // screen). Building as a classic IIFE script + a conservative
            // target avoids depending on native ES module support at all.
            target: 'es2015',
            rollupOptions: {
                input: {
                    main: 'index.html'
                },
                output: {
                    format: 'iife',
                    entryFileNames: 'assets/main-[hash].js'
                }
            }
        }
    };
});
