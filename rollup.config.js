import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { terser } from 'rollup-plugin-terser';
import pkg from "./package.json";

export default {
    input: "index.ts",
    output: {
        file: "dist/out.js",
        format: "cjs",
        inlineDynamicImports: true
    },
    plugins: [
        resolve(), // so Rollup can find `ms`
        commonjs(), // so Rollup can convert `ms` to an ES module
        typescript(),
        terser()
    ]
};