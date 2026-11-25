# Fontes de dados e parâmetros oficiais verificados

Este documento registra todas as fontes de dados abertos consultadas em **24/11/2026**, seus níveis, códigos oficiais confirmados e exemplos reais de resposta.

## 1. Classificação das fontes (Níveis A a D)

| Fonte | Nível | URL oficial / Endpoint | O que fornece | Status |
|---|---|---|---|---|
| **CNES / DATASUS** (Cadastro Nacional de Estabelecimentos de Saúde – CnesWeb, Portal de Dados Abertos do SUS e API DEMAS) | **C** | `http://cnes2.datasus.gov.br/Mod_Ind_Unidade_Listar.asp?VTipo=70`<br>`https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_tipo_unidade=70&limit=20&offset=0`<br>`https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_json.zip` | Estabelecimentos do Tipo `70` (`CENTRO DE ATENÇÃO PSICOSSOCIAL`), código CNES, nome, modalidade, município | **Confirmado** (**302 CAPS reais** extraídos em `data/amostras/amostra_real_cnes_ibge.json` e `data/amostra.json`) |
| **Cartas de Serviços das Secretarias de Saúde** (SMS-Rio/Defensoria-RJ, FeSaúde Niterói, SES-DF, PBH-MG, SMS-POA, SESA-ES) | **C** | `https://www.1746.rio/hc/pt-br/articles/10729603431963`<br>`https://saude.niteroi.rj.gov.br/rede-de-atencao-psicossocial/`<br>`https://www.saude.df.gov.br/carta-caps`<br>`https://prefeitura.pbh.gov.br/saude/informacoes/atencao-a-saude/saude-mental/servicos-de-referencia-em-saude-mental`<br>`https://prefeitura.poa.br/carta-de-servicos/saude-mental`<br>`https://saude.es.gov.br/media/Planejamento/ficha_de_qualificacao/1.5.1-1.pdf` | Endereço completo, bairro e telefone público dos CAPS (cruzados pelo código CNES) | **Confirmado** |
| **IBGE – Censo Demográfico 2022 e Localidades** | **A** | `https://servicodados.ibge.gov.br/api/v1/localidades/estados`<br>`https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[all]` | Unidades da Federação, códigos IBGE de 7 dígitos e população residente (Censo 2022) | **Confirmado** (**76 municípios** em 9 UFs com população oficial do Censo 2022) |
| **Ministério da Saúde – RAPS / Saúde Mental em Dados** | **A** | `https://www.gov.br/saude/pt-br/composicao/saes/desmad/raps/caps`<br>Portaria GM/MS nº 3.088/2011 (Portaria de Consolidação GM/MS nº 3/2017, Anexo V, Título I, Art. 7º) | Conceito e porte populacional de cada modalidade de CAPS e referência nacional de cobertura por 100 mil habitantes | **Confirmado** |

Nenhum dado restrito ou identificado (**Nível D**) é utilizado.

---

## 2. Códigos de Tipo e Subtipo de Unidade confirmados no CNES (SCNES)

Fonte: **Tabela de Tipos e Subtipos de Estabelecimento SCNES** (Portaria SAS/MS nº 511/2000, Portaria SAS/MS nº 198/2008, Portaria GM/MS nº 2.546/2011 e Portaria GM/MS nº 3.088/2011):

- **Código de Tipo de Estabelecimento (`TP_UNIDADE` / `codigo_tipo_unidade`):** **`70`** — `CENTRO DE ATENÇÃO PSICOSSOCIAL`
  - Conceito oficial: *"Unidade especializada que oferece atendimento de cuidados intermediários entre o regime ambulatorial e a internação hospitalar, por equipe multiprofissional, constituindo-se também em ações relativas à saúde mental."*

| Código interno | Modalidade exibida | Código Tipo/Subtipo CNES | Porte populacional (MS) | Peso no indicador ponderado MS |
|---|---|---|---|---|
| `CAPS_I` | CAPS I | **`70.01`** (Subtipo `001`) | Municípios acima de 15 mil hab. | `0,5` (referência: 50 mil hab.) |
| `CAPS_II` | CAPS II | **`70.02`** (Subtipo `002`) | Municípios acima de 70 mil hab. | `1,0` (referência: 100 mil hab.) |
| `CAPS_III` | CAPS III (24 horas) | **`70.03`** (Subtipo `003`) | Municípios acima de 150 mil hab. | `1,5` (referência: 150 mil hab.) |
| `CAPSI` | CAPS i (infantojuvenil) | **`70.04`** (Subtipo `004`) | Municípios acima de 70 mil hab. | `1,0` (referência: 100 mil hab.) |
| `CAPS_AD` | CAPS AD (álcool e outras drogas) | **`70.05`** (Subtipo `005`) | Municípios acima de 70 mil hab. | `1,0` (referência: 100 mil hab.) |
| `CAPS_AD_III` | CAPS AD III (24 horas) | **`70.06`** e **`70.07`** (Subtipos `006` Municipal e `007` Regional) | Municípios/regiões acima de 150 mil hab. | `1,5` (referência: 150 mil hab.) |

*(Nota complementar: na tabela de Serviços Especializados do CNES, o serviço de Atenção Psicossocial corresponde ao código **`115`**).*

---

## 3. Parâmetro oficial de cobertura (CAPS por 100 mil habitantes)

Fonte: **Ministério da Saúde – *Saúde Mental em Dados 12*** e **Portaria de Consolidação GM/MS nº 3/2017 (Anexo V, Título I, Art. 7º)** / Fichas de Qualificação RAPS:

- **Fórmula simples:**
  $$\text{Cobertura simples} = \frac{\text{Nº total de CAPS do município}}{\text{População residente (IBGE)}} \times 100.000$$
- **Fórmula ponderada oficial do Ministério da Saúde:**
  $$\text{Indicador CAPS/100 mil hab.} = \frac{(N_{\text{CAPS I}} \times 0{,}5) + N_{\text{CAPS II}} + (N_{\text{CAPS III}} \times 1{,}5) + N_{\text{CAPS i}} + N_{\text{CAPS AD}} + (N_{\text{CAPS AD III}} \times 1{,}5)}{\text{População residente (IBGE)}} \times 100.000$$
- **Parâmetros oficiais de classificação do Ministério da Saúde:**
  - **Cobertura muito boa (referência nacional):** `>= 0,70` CAPS por 100 mil habitantes
  - **Cobertura boa:** `0,50 a 0,69`
  - **Cobertura regular/baixa:** `0,35 a 0,49`
  - **Cobertura baixa:** `0,20 a 0,34`
  - **Cobertura insuficiente/crítica:** `< 0,20`

---

## 4. Parâmetros verificados da API DEMAS (`GET /cnes/estabelecimentos`)

Documentação oficial verificada em `https://apidadosabertos.saude.gov.br/v1/` e `https://catalogodedadosabertos.com.br/Demas`:

- `codigo_tipo_unidade` (`integer`): código do tipo de unidade (`70` para CAPS)
- `codigo_uf` (`integer`): código IBGE da UF
- `codigo_municipio` (`integer`): código IBGE do município
- `status` (`integer`): `1` (ativo) ou `0` (inativo)
- `limit` (`integer`): quantidade de itens por página (**deve ser menor ou igual a 20**)
- `offset` (`integer`): deslocamento/página

Exemplo real de registro salvo em `data/amostras/amostra_real_cnes_ibge.json`:

```json
{
  "cnes": "0022691",
  "nome": "CERSAM BARREIRO",
  "modalidade": "CAPS_III",
  "codigo_ibge": "3106200",
  "endereco": "Rua Desembargador Ribeiro da Luz, 29",
  "bairro": "Barreiro de Cima",
  "telefone": "(31) 3277-5902",
  "latitude": -19.9767,
  "longitude": -44.0175
}
```
