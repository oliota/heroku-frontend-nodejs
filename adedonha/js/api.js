export class ApiError extends Error {
  constructor(code, message = code, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const operationKey = () => crypto.randomUUID();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class ApiClient {
  constructor(
    base,
    token = async () => null,
    transport = globalThis.fetch.bind(globalThis),
  ) {
    this.base = base.replace(/\/$/, "");
    this.token = token;
    this.transport = transport;
    this.controllers = new Set();
    this.pending = new Map();
    this.uncertain = new Map();
    this.generation = 0;
  }
  cancel() {
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.pending.clear();
    this.uncertain.clear();
  }
  async request(
    path,
    {
      method = "GET",
      body,
      public: isPublic = false,
      key,
      signal,
      retries = 2,
    } = {},
  ) {
    const mutation = method !== "GET";
    const serialized = mutation ? JSON.stringify(body ?? {}) : undefined;
    const fingerprint = `${method}:${path}:${serialized}`;
    key ||= mutation
      ? this.uncertain.get(fingerprint) || operationKey()
      : undefined;
    const generation = this.generation;
    if (key && this.pending.has(key)) {
      const previous = this.pending.get(key);
      if (previous.fingerprint !== fingerprint)
        throw new ApiError("IDEMPOTENCY_CONFLICT");
      return previous.promise;
    }
    const run = async () => {
      let refreshed = false;
      for (let attempt = 0; ; attempt++) {
        if (generation !== this.generation) throw new ApiError("CANCELLED");
        const controller = new AbortController();
        this.controllers.add(controller);
        const abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, 12000);
        try {
          if (signal?.aborted) throw new ApiError("CANCELLED");
          const token = isPublic
            ? null
            : await Promise.race([
                this.token(refreshed),
                new Promise((_, reject) => {
                  if (controller.signal.aborted)
                    reject(new Error("Request timed out"));
                  else
                    controller.signal.addEventListener(
                      "abort",
                      () => reject(new Error("Request timed out")),
                      { once: true },
                    );
                }),
              ]);
          if (!isPublic && !token) throw new ApiError("AUTH_REQUIRED");
          const response = await this.transport(this.base + path, {
            method,
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              ...(mutation
                ? { "Content-Type": "application/json", "Idempotency-Key": key }
                : {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: serialized,
          });
          let envelope;
          try {
            envelope = await response.json();
          } catch {
            throw new ApiError(
              "INVALID_RESPONSE",
              "Resposta inválida da API.",
              response.status,
            );
          }
          if (response.status === 401 && !refreshed && !isPublic) {
            refreshed = true;
            continue;
          }
          if (!response.ok) {
            const error = new ApiError(
              envelope.error?.code || `HTTP_${response.status}`,
              envelope.error?.message,
              response.status,
            );
            if (
              (response.status >= 500 || response.status === 429) &&
              attempt < retries
            ) {
              await pause(
                Math.min(
                  5000,
                  Number(response.headers.get("Retry-After") || 0) * 1000 ||
                    500 * 2 ** attempt,
                ),
              );
              continue;
            }
            throw error;
          }
          if (!Object.hasOwn(envelope, "data"))
            throw new ApiError("INVALID_RESPONSE");
          return envelope.data;
        } catch (error) {
          if (
            signal?.aborted ||
            (controller.signal.aborted && !this.controllers.has(controller))
          )
            throw new ApiError("CANCELLED");
          if (error instanceof ApiError) {
            error.path ||= path;
            error.method ||= method;
            throw error;
          }
          if (attempt >= retries) {
            const offline = typeof navigator !== "undefined" && navigator.onLine === false;
            const timedOut = controller.signal.aborted && !signal?.aborted;
            throw new ApiError(
              offline ? "DEVICE_OFFLINE" : timedOut ? "API_TIMEOUT" : "API_UNREACHABLE",
              offline ? "Dispositivo sem ligação de rede." : timedOut ? "O servidor demorou a responder." : "O serviço online não respondeu. A internet pode estar a funcionar normalmente.",
            );
          }
          await pause(400 * 2 ** attempt);
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
          this.controllers.delete(controller);
        }
      }
    };
    const promise = run();
    if (key) this.pending.set(key, { fingerprint, promise });
    try {
      const result = await promise;
      this.uncertain.delete(fingerprint);
      return result;
    } catch (error) {
      if (
        mutation &&
        (["NETWORK_ERROR", "DEVICE_OFFLINE", "API_TIMEOUT", "API_UNREACHABLE"].includes(error.code) || error.status >= 500) &&
        generation === this.generation
      )
        this.uncertain.set(fingerprint, key);
      else this.uncertain.delete(fingerprint);
      throw error;
    } finally {
      if (key) this.pending.delete(key);
    }
  }
  get(path, options) {
    return this.request(path, options);
  }
  mutate(path, body = {}, method = "POST", options = {}) {
    return this.request(path, { ...options, method, body });
  }
}
