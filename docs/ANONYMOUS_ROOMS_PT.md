# Acesso por apelido ou Google

- Jogar sozinho: informar apelido (2–24 caracteres); o jogo local não usa login Firebase.
- Criar sala ou entrar por código: informar apelido e continuar; o navegador obtém um Firebase ID token anónimo em segundo plano.
- Google é opcional e apresenta o email da conta, validado pelo backend.
- O navegador mantém a sessão anónima no dispositivo atual; limpar os dados do site pode fazer perder o identificador de convidado.
- Ao conectar Google a um convidado novo, a aplicação tenta vincular a conta mantendo o UID. Se já houver conta Google, troca para a conta existente; a fusão dos históricos de UIDs diferentes não é automática.
- Habilitar Anonymous e Google no Firebase Authentication e publicar regras Firestore compatíveis no mesmo projeto.
- Para desenvolvimento, usar `npm run dev` em ambos os serviços; o nodemon reinicia o servidor Node. Atualizar a página para carregar alterações de JS/CSS.
