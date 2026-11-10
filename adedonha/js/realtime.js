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
          this.state.room?.status === "playing" ? 1000 : 4000,
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
    this.sequence = 0;
    this.final = false;
    this.revision = 0;
    this.savedRevision = 0;
    this.key = "";
    this.ready = false;
    this.sending = null;
    this.pendingSubmission = null;
  }
  async restore() {
    this.reset();
    const room = this.state.room,
      generation = this.generation;
    this.key = `${room.game_id}:${room.round_id}`;
    this.answers = room.categories.map(() => "");
    if (!this.auth.db)
      throw new Error(
        "Não foi possível recuperar o rascunho privado. Reconecte ao Firebase antes de digitar.",
      );
    const saved = await this.auth.draft(room.code, this.auth.user.uid);
    if (generation !== this.generation) return;
    if (saved?.round_id === room.round_id) {
      this.sequence = saved.sequence;
      this.answers = [...saved.answers];
      this.final = saved.final;
    }
    this.ready = true;
    this.onStatus(this.final ? "Respostas finais recebidas" : "Sincronizado");
  }
  edit(index, value) {
    if (!this.ready || this.final) return;
    this.answers[index] = value;
    this.revision++;
    this.onStatus("Salvando…");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush().catch(this.onError), 1100);
  }
  async flush(final = false) {
    clearTimeout(this.timer);
    if (!this.ready || this.final) return;
    if (this.sending) {
      await this.sending;
      return this.flush(final);
    }
    if (!final && this.savedRevision === this.revision) return;
    const requestedFinal = final;
    const generation = this.generation;
    const submission = this.pendingSubmission || {
      answers: [...this.answers],
      sequence: ++this.sequence,
      final,
      revision: this.revision,
    };
    const { answers, sequence, revision } = submission;
    final = submission.final;
    this.pendingSubmission = submission;
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
      this.pendingSubmission = null;
      this.savedRevision = revision;
      this.final = final;
      this.onStatus(
        final
          ? "Respostas finais recebidas"
          : this.savedRevision === this.revision
            ? "Sincronizado"
            : "Salvando…",
      );
    } catch (error) {
      this.onStatus("Envio pendente — tente novamente");
      throw error;
    } finally {
      if (generation === this.generation) this.sending = null;
    }
    if (requestedFinal && !final && generation === this.generation)
      return this.flush(true);
    if (
      !final &&
      generation === this.generation &&
      this.revision !== this.savedRevision
    )
      this.timer = setTimeout(() => this.flush().catch(this.onError), 1100);
  }
}
