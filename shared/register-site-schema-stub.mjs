/**
 * Preload for tsx/node: register site-schema stub resolve hooks.
 * Usage: tsx --import ./shared/register-site-schema-stub.mjs …
 */
import { register } from "node:module";

register("./site-schema-stub-hooks.mjs", import.meta.url);
