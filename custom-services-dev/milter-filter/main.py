import Milter
import json
import logging
import logging.handlers
from datetime import datetime

# =========================
# CONFIGURAÇÃO DE LOGGING
# =========================

logger = logging.getLogger("saas_milter")
logger.setLevel(logging.INFO)

try:
    handler = logging.handlers.SysLogHandler(address="/dev/log")
except Exception:
    # Fallback para sistemas sem /dev/log (ex: macOS)
    handler = logging.handlers.SysLogHandler(address=("localhost", 514))

formatter = logging.Formatter(
    "%(name)s[%(process)d]: %(levelname)s %(message)s"
)

handler.setFormatter(formatter)
logger.addHandler(handler)


# =========================
# MILTER
# =========================

class SaasMilter(Milter.Base):

    def __init__(self):
        self.id = Milter.uniqueID()
        self.user_auth = None
        self.envelope_sender = None
        self.recipients = []
        self.body_size = 0
        self.message_id = "N/A"
        self.data_inicio = datetime.utcnow().isoformat()

        logger.info(f"[INIT] Nova sessão iniciada id={self.id}")

    @Milter.noreply
    def connect(self, hostname, family, hostaddr):
        logger.info(
            f"[CONNECT] host={hostname} addr={hostaddr} id={self.id}"
        )
        return Milter.CONTINUE

    def envfrom(self, mailfrom, *str):
        self.envelope_sender = mailfrom
        self.user_auth = self.getsymval("{auth_authen}")

        logger.info(
            f"[MAIL FROM] from={mailfrom} auth={self.user_auth} id={self.id}"
        )
        return Milter.CONTINUE

    def envrcpt(self, to, *str):
        self.recipients.append(to)

        logger.info(
            f"[RCPT TO] to={to} id={self.id}"
        )
        return Milter.CONTINUE

    def header(self, name, value):
        if name.lower() == "message-id":
            self.message_id = value

        return Milter.CONTINUE

    @Milter.noreply
    def body(self, chunk):
        self.body_size += len(chunk)
        return Milter.CONTINUE

    def eom(self):
        payload = {
            "cliente_id": self.user_auth,
            "message_id": self.message_id,
            "envelope_from": self.envelope_sender,
            "destinatarios": self.recipients,
            "tamanho_total_bytes": self.body_size,
            "data_envio": self.data_inicio,
            "status": "capturado"
        }

        json_output = json.dumps(payload, ensure_ascii=False)

        logger.info(
            f"[EOM] Mensagem capturada id={self.id} payload={json_output}"
        )

        # Aqui entraria Redis / API / fila
        # redis_client.rpush("fila_nestjs", json_output)

        return Milter.ACCEPT


# =========================
# MAIN
# =========================

def main():
    socketname = "inet:8800@127.0.0.1"

    Milter.factory = SaasMilter

    logger.info("SaasMilter iniciado na porta 8800")

    Milter.runmilter(
        "SaasMilter",
        socketname,
        240
    )


if __name__ == "__main__":
    main()
