// Parser de mensagens do WhatsApp em formato fixo.
//
// Formato esperado (linhas independentes, ordem livre):
//
//   Nome: João Silva
//   Telefone: (81) 99999-9999
//   Endereço: Rua X, 100
//   Pagamento: Pix
//   5x Frango com Catupiry
//   3x Queijo
//   Obs: sem cebola
//
// Linhas que começam por "<num>x <sabor>" viram itens.
// O sabor é resolvido contra o cardápio (match exato, depois substring, sem acento).
// Asteriscos do markdown do WhatsApp (*Nome:*) são tolerados.

function normalize(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function matchFlavor(rawName, flavors) {
    const target = normalize(rawName);
    if (!target) return null;

    let found = flavors.find(f => normalize(f.name) === target);
    if (found) return found;

    found = flavors.find(f => normalize(f.name).includes(target));
    if (found) return found;

    found = flavors.find(f => target.includes(normalize(f.name)));
    return found || null;
}

function parseOrderText(text, flavors) {
    const result = {
        customer: '',
        phone: '',
        address: '',
        payment: '',
        notes: '',
        items: [],
    };
    const unknownItems = [];
    const errors = [];

    const lines = String(text || '')
        .split(/\r?\n/)
        .map(l => l.replace(/\*+/g, '').trim())
        .filter(Boolean);

    const fieldRegex = /^(nome|cliente|telefone|tel|fone|endereco|endereço|pagamento|pgto|obs|observacao|observação)\s*[:\-]\s*(.+)$/i;
    const itemRegex  = /^(\d+)\s*x?\s+(.+)$/i;

    for (const line of lines) {
        const fm = line.match(fieldRegex);
        if (fm) {
            const key = normalize(fm[1]);
            const value = fm[2].trim();
            if (key === 'nome' || key === 'cliente')                     result.customer = value;
            else if (key === 'telefone' || key === 'tel' || key === 'fone') result.phone = value;
            else if (key === 'endereco')                                 result.address = value;
            else if (key === 'pagamento' || key === 'pgto')              result.payment = value;
            else if (key === 'obs' || key === 'observacao')              result.notes = value;
            continue;
        }

        const im = line.match(itemRegex);
        if (im) {
            const qty = parseInt(im[1], 10);
            const name = im[2].trim();
            if (qty <= 0) continue;

            const flavor = matchFlavor(name, flavors);
            if (flavor) {
                result.items.push({
                    flavorId: flavor.id,
                    name: flavor.name,
                    quantity: qty,
                    price: Number(flavor.price),
                });
            } else {
                unknownItems.push({ raw: line, requested: name, quantity: qty });
            }
        }
    }

    if (!result.customer) errors.push('campo "Nome" ausente');
    if (!result.address)  errors.push('campo "Endereço" ausente');
    if (result.items.length === 0) errors.push('nenhum item de pedido reconhecido');

    return { order: result, unknownItems, errors };
}

module.exports = { parseOrderText, normalize, matchFlavor };
