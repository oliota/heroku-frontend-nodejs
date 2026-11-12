export class Realtime {
  constructor({ auth, state, client, onError, onConnection }) {
    Object.assign(this, { auth, state, client, onError, onConnection });
  }
  start() {
    this.stop();
    const room = this.state.room;
    if (!room) return;
    const generation = this.generation;
    if (this.auth.db)
      this.unsubscribe = this.auth.watch(
        `rooms/${room.code}`,
        (value) => {
          if (generation === this.generation) this.state.apply(value);
        },
        (error) => {
          this.onConnection(
            "Atualização em tempo real indisponível. Usando consultas à API.",
          );
          this.onError(error);
        },
      );
    const poll = async () => {
      if (generation !== this.generation) return;
      const current = this.state.room;
      if (!current || ["closed", "finished"].includes(current.status)) return;
      try {
        await this.client.refresh();
        this.onConnection("");
      } catch (error) {
        if (generation === this.generation)
          this.onConnection(
            `Conexão interrompida (${error.code || "NETWORK_ERROR"}). Tentando novamente…`,
          );
      }
      if (generation === this.generation)
        this.pollTimer = setTimeout(
          poll,
          ["playing", "review", "letter_selection"].includes(this.state.room?.status) ? 1250 : 4000,
        );
    };
    this.pollTimer = setTimeout(poll, 1000);
    const heartbeat = async () => {
      if (
        generation !== this.generation ||
        !this.state.room ||
        ["closed", "finished"].includes(this.state.room.status)
      )
        return;
      if (!document.hidden)
        try {
          await this.client.mutate("heartbeat");
        } catch (error) {
          this.onConnection(
            `Presença pendente (${error.code || "NETWORK_ERROR"}).`,
          );
        }
      if (generation === this.generation)
        this.heartbeatTimer = setTimeout(heartbeat, 25000);
    };
    this.heartbeatTimer = setTimeout(heartbeat, 25000);
  }
  stop() {
    this.generation = (this.generation || 0) + 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    clearTimeout(this.pollTimer);
    clearTimeout(this.heartbeatTimer);
  }
}
export class Drafts {
  constructor({ client, state, auth, onStatus, onError }) {
    Object.assign(this, { client, state, auth, onStatus, onError });
    this.reset();
  }
  reset() {
    clearTimeout(this.timer);
    this.generation = (this.generation || 0) + 1;
    this.answers = [];
    this.sequence = -1;
    this.final = false;
    this.revision = 0;
    this.savedRevision = 0;
    this.key = "";
    this.cacheKey = "";
    this.ready = false;
    this.sending = null;
    this.pendingSubmission = null;
  }
  clearUser(uid) {
    try {
      const prefix = `adedonha:draft:${uid}:`;
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
      }
    } catch {}
  }
  cache() {
    try {
      return JSON.parse(sessionStorage.getItem(this.cacheKey) || "null");
    } catch {
      return null;
    }
  }
  persist(dirty = true) {
    if (!this.cacheKey) return;
    try {
      sessionStorage.setItem(
        this.cacheKey,
        JSON.stringify({
          answers: this.answers,
          sequence: this.sequence,
          dirty,
          final: this.final,
        }),
      );
    } catch {}
  }
  async restore() {
    this.reset();
    const room = this.state.room;
    const generation = this.generation;
    this.key = `${room.game_id}:${room.round_id}`;
    this.cacheKey = `adedonha:draft:${this.auth.user.uid}:${room.room_id}:${this.key}`;
    const previous = this.cache();
    const saved = await this.client.api.get(`/rooms/${room.code}/answers/me`);
    if (generation !== this.generation) return;
    this.sequence = saved?.round_id === room.round_id ? saved.sequence : -1;
    this.answers = saved?.round_id === room.round_id
      ? [...saved.answers]
      : room.categories.map(() => "");
    this.final = saved?.round_id === room.round_id && saved.final === true;
    const pending = !this.final && previous?.dirty === true &&
      Array.isArray(previous.answers) && previous.answers.length === room.categories.length;
    if (pending) {
      this.answers = [...previous.answers];
      this.sequence = Math.max(this.sequence, previous.sequence ?? -1);
      this.revision = 1;
    }
    this.ready = true;
    this.persist(pending);
    this.onStatus(this.final ? "Respostas finais recebidas" : pending ? "Retomando respostas pendentes…" : "Sincronizado");
    if (pending) this.timer = setTimeout(() => this.flush().catch(this.onError), 150);
  }
  edit(index, value) {
    if (!this.ready || this.final) return;
    this.answers[index] = value;
    this.revision++;
    this.persist();
    this.onStatus("Salvando…");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush().catch(this.onError), 250);
  }
  async stopNow() {
    clearTimeout(this.timer);
    if (!this.ready) throw Object.assign(new Error("Respostas ainda não carregadas."), { code: "INVALID_STATE" });
    if (this.sending) await this.sending;
    const answers = this.answers.map((answer) => String(answer).trim());
    const sequence = ++this.sequence;
    const room = this.state.room;
    const result = await this.client.mutate("stop", this.final ? {} : { answers, sequence }, {
      round: true,
      valid: (r) => r.status === "playing",
      applied: (r) => !!r.stop_at || r.status === "review",
    });
    this.final = true;
    this.savedRevision = this.revision;
    this.persist(false);
    this.onStatus("STOP confirmado. Respostas encerradas.");
    return result;
  }
  async flush(final = false) {
    clearTimeout(this.timer);
    if (!this.ready || this.final) return;
    if (this.sending) {
      await this.sending;
      return this.flush(final);
    }
    if (!final && this.savedRevision === this.revision && !this.pendingSubmission) return;
    const requestedFinal = final;
    const generation = this.generation;
    const submission = this.pendingSubmission || {
      answers: this.answers.map((answer) => String(answer).trim()),
      sequence: ++this.sequence,
      final,
      revision: this.revision,
    };
    const { answers, sequence, revision } = submission;
    final = submission.final;
    this.pendingSubmission = submission;
    this.persist();
    this.sending = this.client.mutate(
      "answers",
      { answers, final, sequence },
      {
        method: "PUT",
        round: true,
        valid: (room) => room.status === "playing",
        applied: () => false,
      },
    );
    try {
      await this.sending;
      if (generation !== this.generation) return;
      if (final) {
        const saved = await this.client.api.get(`/rooms/${this.state.room.code}/answers/me`);
        if (saved.round_id !== this.state.room.round_id || !saved.final ||
            JSON.stringify(saved.answers) !== JSON.stringify(answers)) {
          throw Object.assign(new Error("O servidor não confirmou suas respostas finais."), { code: "ANSWER_SAVE_MISMATCH" });
        }
      }
      this.pendingSubmission = null;
      this.savedRevision = revision;
      this.final = final;
      this.persist(this.revision !== this.savedRevision && !this.final);
      if (this.final) {
        try { sessionStorage.removeItem(this.cacheKey); } catch {}
      }
      this.onStatus(final ? "Respostas finais recebidas" : this.savedRevision === this.revision ? "Sincronizado" : "Salvando…");
    } catch (error) {
      this.persist();
      this.onStatus("Envio pendente — tente novamente");
      throw error;
    } finally {
      if (generation === this.generation) this.sending = null;
    }
    if (requestedFinal && !final && generation === this.generation) return this.flush(true);
    if (!final && generation === this.generation && this.revision !== this.savedRevision)
      this.timer = setTimeout(() => this.flush().catch(this.onError), 250);
  }
}
