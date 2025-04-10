import { terser } from "rollup-plugin-terser";

export default [
  {
    input: "src/index.js",
    output: [
      {
        file: "dist/logitech-g29.js",
        format: "cjs",
        sourcemap: true,
      },
      {
        file: "dist/logitech-g29.esm.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/logitech-g29.iife.js",
        format: "iife",
        name: "LogitechG29",
        sourcemap: true,
        plugins: [terser()],
      },
    ],
  },
];
