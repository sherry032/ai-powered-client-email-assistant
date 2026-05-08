import hashlib

import bcrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, encoded: str) -> bool:
    if not encoded.startswith(("$2a$", "$2b$", "$2y$")):
        return False
    return bcrypt.checkpw(password.encode("utf-8"), encoded.encode("utf-8"))


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
