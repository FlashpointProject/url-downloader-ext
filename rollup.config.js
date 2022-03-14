import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { terser } from 'rollup-plugin-terser';

export default {
    input: "index.ts",
    output: {
        file: "dist/out.js",
        format: "cjs",
        inlineDynamicImports: true
    },
    external: [
        'flashpoint-launcher'
    ],
    plugins: [
        resolve(),
        commonjs(),
        typescript(),
        terser(),
    ]
};