-- Remove sabores duplicados de chocolate branco do cardapio.
-- Os sabores Laka e Laka com Morango permanecem disponiveis.

DELETE FROM flavors
WHERE LOWER(name) IN (
    'chocolate branco',
    'chocolate branco com morango'
);
