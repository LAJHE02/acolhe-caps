# Amostras reais (Plano B / modo offline)

Esta pasta guarda as amostras reais usadas quando a API pública está indisponível ou sem conexão (Plano B obrigatório):

- `amostra_real_cnes_ibge.json`: amostra **100% real** coletada em **24/11/2026** a partir de:
  - **CnesWeb / DATASUS** (`Mod_Ind_Unidade_Listar.asp?VTipo=70` — Tipo de Estabelecimento `70 = CENTRO DE ATENÇÃO PSICOSSOCIAL`): **186 estabelecimentos CAPS reais** em **8 Unidades da Federação** (`DF`, `MG`, `RS`, `ES`, `MS`, `MT`, `PI`, `PR`), com seus códigos CNES oficiais e nomes oficiais.
  - **Cartas de serviços oficiais das Secretarias de Saúde**:
    - Secretaria de Saúde do Distrito Federal (`saude.df.gov.br/carta-caps` e `Telefones-CAPS_Janeiro2021-1.pdf`) — endereços, bairros/RAs e telefones dos 19 CAPS de Brasília/DF.
    - Prefeitura de Belo Horizonte (`prefeitura.pbh.gov.br/saude/informacoes/atencao-a-saude/saude-mental/servicos-de-referencia-em-saude-mental`, atualizado em 28/10/2026) — endereços, bairros e telefones dos 16 CERSAM/CAPS de Belo Horizonte/MG.
    - Prefeitura de Porto Alegre (`prefeitura.poa.br/carta-de-servicos/saude-mental`, atualizado em 20/08/2026) — endereços, bairros e telefones dos 17 CAPS de Porto Alegre/RS.
    - Secretaria de Estado da Saúde do Espírito Santo (`saude.es.gov.br/media/Planejamento/ficha_de_qualificacao/1.5.1-1.pdf` e `Meta 1.5.1.pdf`) — relação oficial com códigos CNES, modalidades e municípios dos CAPS do ES.
  - **IBGE – Censo Demográfico 2022** (Tabela SIDRA 4714): população residente oficial de **53 municípios** (incluindo municípios sem CAPS próprio para demonstrar vazios assistenciais e busca de serviços mais próximos).

Para carregar esta amostra real no banco SQLite (`data/acolhe.db`) e gerar `data/caps.json`:

```bash
python3 scripts/carga_real.py carregar-amostra
```

Quando `python3 scripts/carga_real.py descobrir` e `python3 scripts/carga_real.py carregar` são executados em ambiente com acesso direto às APIs (`apidadosabertos.saude.gov.br` e `servicodados.ibge.gov.br`), novas amostras brutas são salvas automaticamente nesta pasta.
