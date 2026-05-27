-- Cadastro de bairros para autocomplete/consulta futura

CREATE TABLE IF NOT EXISTS neighborhoods (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garante unicidade case-insensitive (ex: "Boa Viagem" == "boa viagem")
CREATE UNIQUE INDEX IF NOT EXISTS neighborhoods_name_lower_uniq
ON neighborhoods (LOWER(name));

