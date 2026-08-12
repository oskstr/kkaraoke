/** Serialize JSON so it is safe to embed in `<script type="application/json">`. */
export function jsonForScript(value: unknown): string {
    return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
