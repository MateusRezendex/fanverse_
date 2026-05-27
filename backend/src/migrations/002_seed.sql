-- Seed "default" do cardápio.
-- Idempotente: só insere sabores que ainda não existem (por nome).

INSERT INTO flavors (name, description, price, category, available)
SELECT v.name, v.description, v.price, v.category, v.available
FROM (
    VALUES
        -- Tradicionais
        ('Frango com Catupiry', 'Frango desfiado com catupiry original e cheiro verde fresco.', 7.99, 'Salgada', TRUE),
        ('Carne', 'Carne moída premium temperada com tomate, cebola e limão.', 7.99, 'Salgada', TRUE),
        ('Queijo', 'Mix de mussarela, queijo minas, creme de leite e orégano.', 7.99, 'Salgada', TRUE),
        ('Queijo com Presunto', 'Mussarela selecionada, presunto picado e orégano.', 7.99, 'Salgada', TRUE),
        ('Calabresa com Cebola', 'Calabresa fatiada, cebola e um toque de mussarela.', 7.99, 'Salgada', TRUE),
        ('Bacon', 'Bacon crocante em fatias com generosa camada de mussarela.', 7.99, 'Salgada', TRUE),
        ('Frango com Bacon', 'Combinação perfeita de frango desfiado, bacon e mussarela.', 7.99, 'Salgada', TRUE),

        -- Premium
        ('3 Queijos', 'A união nobre de Mussarela, Catupiry e Provolone defumado.', 8.99, 'Premium', TRUE),
        ('Brócolis com Queijo', 'Brócolis fresco no vapor, mussarela e pedaços de bacon.', 8.99, 'Premium', TRUE),
        ('Lombinho Canadense', 'Lombo canadense fatiado com mussarela.', 8.99, 'Premium', TRUE),
        ('Carne Seca', 'Carne seca desfiada artesanalmente com catupiry.', 10.50, 'Premium', TRUE),

        -- Doces
        ('Chocolate c/ Morango', 'Ganache de chocolate ao leite com morangos frescos fatiados.', 9.99, 'Doce', TRUE),
        ('Chocolate com MM', 'Chocolate cremoso coberto com M&Ms coloridos.', 9.99, 'Doce', TRUE),
        ('Banana Nevada', 'Banana fatiada, chocolate branco gratinado, açúcar e canela.', 8.99, 'Doce', TRUE),
        ('Abacaxi Nevado', 'Abacaxi em calda artesanal com chocolate branco gratinado.', 8.99, 'Doce', TRUE),
        ('Churros', 'Doce de leite cremoso com toque de canela e açúcar.', 8.99, 'Doce', TRUE),
        ('Romeu e Julieta', 'A clássica combinação de queijo minas com goiabada.', 8.99, 'Doce', TRUE)
) AS v(name, description, price, category, available)
WHERE NOT EXISTS (
    SELECT 1 FROM flavors f WHERE f.name = v.name
);
