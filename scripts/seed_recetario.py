#!/usr/bin/env python3
"""
seed_recetario.py
=================

Crea y siembra la base de datos del recetario del agente Chef Creativo.

Esquema (4 tablas principales + 3 relaciones many-to-many):

  products             ←→  elaboration_products  ←→  elaborations
  techniques           ←→  elaboration_techniques ←→  ┘
  machinery            ←→  elaboration_machinery  ←→  ┘

Donde:
- products: ingredientes con categoría y estacionalidad.
- elaborations: preparaciones de cocina (fondos, salsas, masas, marinados, etc.).
- techniques: técnicas culinarias (blancheado, confitado, braseado...).
- machinery: equipamiento de cocina (horno combi, termocirculador...).

Las 3 tablas de relación expresan qué productos / técnicas / maquinaria
intervienen en cada elaboración y en qué orden/medida.

USO:
    python scripts/seed_recetario.py             # crea/sobrescribe el DB
    python scripts/seed_recetario.py --check     # verifica que el DB existe

El DB se commitea al repo (referencia compartida, no datos por restaurante).
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = (
    PROJECT_ROOT
    / "conocimiento"
    / "interno_app"
    / "recursos"
    / "recetario.db"
)

SCHEMA = """
-- Tablas principales
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    season TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS techniques (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    family TEXT NOT NULL,
    description TEXT,
    difficulty TEXT
);

CREATE TABLE IF NOT EXISTS machinery (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    capacity TEXT,
    power TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS elaborations (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    yield TEXT,
    prep_time_min INTEGER,
    difficulty TEXT,
    notes TEXT
);

-- Relaciones many-to-many
CREATE TABLE IF NOT EXISTS elaboration_products (
    elaboration_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity TEXT,
    unit TEXT,
    role TEXT,
    PRIMARY KEY (elaboration_id, product_id),
    FOREIGN KEY (elaboration_id) REFERENCES elaborations(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS elaboration_techniques (
    elaboration_id INTEGER NOT NULL,
    technique_id INTEGER NOT NULL,
    step_order INTEGER NOT NULL,
    duration_min INTEGER,
    notes TEXT,
    PRIMARY KEY (elaboration_id, technique_id),
    FOREIGN KEY (elaboration_id) REFERENCES elaborations(id) ON DELETE CASCADE,
    FOREIGN KEY (technique_id) REFERENCES techniques(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS elaboration_machinery (
    elaboration_id INTEGER NOT NULL,
    machinery_id INTEGER NOT NULL,
    step_order INTEGER,
    usage_notes TEXT,
    PRIMARY KEY (elaboration_id, machinery_id),
    FOREIGN KEY (elaboration_id) REFERENCES elaborations(id) ON DELETE CASCADE,
    FOREIGN KEY (machinery_id) REFERENCES machinery(id) ON DELETE CASCADE
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_eproduct ON elaboration_products(product_id);
CREATE INDEX IF NOT EXISTS idx_etech ON elaboration_techniques(technique_id);
CREATE INDEX IF NOT EXISTS idx_emach ON elaboration_machinery(machinery_id);
CREATE INDEX IF NOT EXISTS idx_prod_cat ON products(category);
CREATE INDEX IF NOT EXISTS idx_elab_type ON elaborations(type);
"""


# ── Seed data ───────────────────────────────────────────────────────────────

PRODUCTS = [
    # Verduras
    ("ajo", "verdura", "bulbo", "todo el año", "Base de la cocina mediterránea."),
    ("cebolla", "verdura", "bulbo", "todo el año", "Base del sofrito."),
    ("puerro", "verdura", "bulbo", "otoño-invierno", "Para fondos blancos."),
    ("tomate", "verdura", "fruto", "verano", "Perifollo de salsas y fondos."),
    ("pimiento rojo", "verdura", "fruto", "verano-otoño", "Asados, salsas."),
    ("pimiento verde", "verdura", "fruto", "verano-otoño", "Frituras, sofritos."),
    ("berenjena", "verdura", "fruto", "verano", "Esencial en cocina mediterránea."),
    ("calabacín", "verdura", "fruto", "verano", "Versátil, plancha o crema."),
    ("calabaza", "verdura", "fruto", "otoño-invierno", "Cremas, asados."),
    ("espinaca", "verdura", "hoja", "otoño-invierno", "Para rellenos, cremas."),
    ("alcachofa", "verdura", "flor", "otoño-invierno-primavera", "Temporada fuerte en invierno."),
    ("espárrago", "verdura", "tallo", "primavera", "Temporada corta."),
    ("brócoli", "verdura", "flor", "otoño-invierno", "Vapor, salteado, crema."),
    ("zanahoria", "verdura", "raíz", "todo el año", "Para fondos y brunoise."),
    ("apio", "verdura", "tallo", "todo el año", "Bouquet garni, fondos."),
    ("patata", "verdura", "tubérculo", "todo el año", "Reina de la cocina popular."),
    ("champiñón", "verdura", "hongo", "todo el año", "Salteados, cremas."),
    # Hierbas y especias
    ("perejil", "hierba", "fresca", "todo el año", "El rey de las hierbas."),
    ("albahaca", "hierba", "fresca", "primavera-verano", "Pesto, italianos."),
    ("romero", "hierba", "fresca", "todo el año", "Asados, mediterráneo."),
    ("tomillo", "hierba", "fresca", "todo el año", "Estofados, marinados."),
    ("orégano", "hierba", "fresca/seca", "todo el año", "Pizza, mediterráneo."),
    ("laurel", "hierba", "seca", "todo el año", "Bouquet garni."),
    ("menta", "hierba", "fresca", "primavera-verano", "Cócteles, cordero."),
    ("pimentón", "especia", "seca", "todo el año", "Ahumado o dulce."),
    ("pimienta negra", "especia", "seca", "todo el año", "Sin descremar."),
    ("comino", "especia", "seca", "todo el año", "Esencial en cocina árabe."),
    ("azafrán", "especia", "secas", "otoño", "Paellas, arroces."),
    # Proteínas
    ("pollo", "proteína", "ave", "todo el año", "Asados, braseados, fondos."),
    ("cerdo", "proteína", "carne", "todo el año", "Chuletas, secreto, lacón."),
    ("cordero", "proteína", "carne", "primavera-otoño", "Asados, paletilla."),
    ("ternera", "proteína", "carne", "todo el año", "Estofados, solomillo."),
    ("salmón", "proteína", "pescado", "otoño-primavera", "Plancha, al vapor."),
    ("bacalao", "proteína", "pescado", "todo el año", "Salazón, brandada."),
    ("gamba", "proteína", "marisco", "otoño-invierno", "Plancha, al ajillo."),
    # Lácteos
    ("mantequilla", "lácteo", "grasa", "todo el año", "Base de muchas salsas."),
    ("nata", "lácteo", "líquido", "todo el año", "Salsas, cremas."),
    ("leche", "lácteo", "líquido", "todo el año", "Bechamel, natillas."),
    ("queso curado", "lácteo", "sólido", "todo el año", "Salsas, gratinados."),
    # Otros
    ("aceite oliva", "grasa", "vegetal", "todo el año", "Base de la cocina mediterránea."),
    ("vinagre balsámico", "conserva", "líquido", "todo el año", "Aliños, reducciones."),
    ("vino tinto", "vino", "tinto", "todo el año", "Desglasar, fondos."),
    ("vino blanco", "vino", "blanco", "todo el año", "Mariscos, fondos."),
    ("sal", "condimento", "mineral", "todo el año", "Salazón,点了."),
    ("huevo", "proteína", "huevo", "todo el año", "Emulsiones, ligado."),
    ("harina", "cereal", "polvo", "todo el año", "Espesar, masas."),
    ("azúcar", "endulzante", "cristal", "todo el año", "Caramelización."),
]

TECHNIQUES = [
    ("brunoise", "corte", "Técnica de corte en dados de 3-5mm.", "fácil"),
    ("juliana", "corte", "Técnica de corte en tiras finas de 2-3mm × 4-5cm.", "fácil"),
    ("desalado", "preparación", "Remojo prolongado para eliminar sal de productos salados (bacalao, mojama).", "fácil"),
    ("blancheado", "cocción", "Cocción breve en agua hirviendo con sal para fijar color, ablandar o quitar amargor.", "fácil"),
    ("escalfado", "cocción", "Cocción a temperatura justo bajo 100°C, sin burbujas, para piezas delicadas.", "media"),
    ("salteado", "cocción", "Cocción rápida a fuego fuerte con poco aceite, removiendo constantemente.", "fácil"),
    ("braseado", "cocción", "Cocción lenta con poca cantidad de líquido aromático en recipiente cerrado.", "media"),
    ("estofado", "cocción", "Cocción muy lenta totalmente cubierta de líquido, hasta desmenuzar.", "media"),
    ("asado", "cocción", "Cocción en horno seco a temperatura controlada.", "media"),
    ("a la parrilla", "cocción", "Cocción sobre fuente de calor directa (brasas o grill).", "fácil"),
    ("plancha", "cocción", "Cocción sobre placa metálica caliente, sin brasas.", "fácil"),
    ("vapor", "cocción", "Cocción con vapor de agua, sin inmersión.", "fácil"),
    ("hervido a fuego lento", "cocción", "Cocción prolongada justo bajo el hervor para fondos y caldos.", "fácil"),
    ("freído", "cocción", "Cocción por inmersión en aceite o grasa caliente.", "media"),
    ("confitado", "cocción", "Cocción lenta en grasa (aceite o mantequilla) a baja temperatura.", "media"),
    ("sous-vide", "cocción", "Cocción al vacío a temperatura controlada por termocirculador.", "alta"),
    ("ahumado", "cocción", "Cocción o conservación exponiendo a humo de maderas aromáticas.", "alta"),
    ("reducción", "técnica", "Concentración de un líquido por evaporación para espesar e intensificar sabores.", "fácil"),
    ("emulsionado", "técnica", "Suspensión estable de grasa en líquido (o viceversa) por agitación o emulsionantes.", "media"),
    ("montar con mantequilla", "técnica", "Incorporación de mantequilla fría en una salsa para emulsionar y dar brillo.", "alta"),
    ("caramelización", "técnica", "Transformación de azúcares por calor hasta punto dorado con sabor complejo.", "media"),
    ("marinado", "técnica", "Maceração de alimentos en líquido aromático para saborizar y/o ablandar.", "fácil"),
    ("encurtido", "conservación", "Conservación en vinagre o salmuera ácida para alargar vida y dar acidez.", "fácil"),
    ("salazón", "conservación", "Conservación por deshidratación con sal, base del bacalao y jamones.", "alta"),
    ("fermentación", "conservación", "Transformación por microorganismos (bacterias, levaduras, mohos) que generan acidez y sabor.", "alta"),
    ("flambeado", "acabado", "Quema breve del alcohol de un licor en la sartén para dar aroma.", "media"),
]

MACHINERY = [
    ("horno combi", "horno", "10-20 raciones", "eléctrico/gas", "Vapor + calor seco. Esencial para asados, vapor y regeneración."),
    ("horno de piedra", "horno", "8-12 pizzas", "gas/leña", "Alta temperatura (350-400°C). Pizzas, panes, asados rápidos."),
    ("salamandra", "horno", "1 ración", "eléctrico", "Gratinador de superficie, ideal para acabados."),
    ("termocirculador", "precisión", "20-30L", "eléctrico 1-2kW", "Cocción sous-vide a temperatura exacta."),
    ("freidora", "freidora", "8-15L", "eléctrica/gas", "Freído rápido y uniforme."),
    ("plancha", "plancha", "1-2 raciones", "eléctrica/gas", "Cocción por contacto directo a alta temperatura."),
    ("sartén", "utensilio", "20-32cm", "n/a", "Salteados, reducciones, acabadas."),
    ("olla", "utensilio", "10-50L", "inducción/gas", "Fondos, estofados, hervidos."),
    ("batidora de vaso", "eléctrico", "1-3L", "500-1500W", "Purés, smoothies, triturar."),
    ("batidora de brazo", "eléctrico", "n/a", "500-1000W", "Cremas, sopas, emulsionar."),
    ("amasadora", "amasadora", "10-30L", "1-3kW", "Masas de pan, pasta, hojaldre."),
    ("abatidor", "refrigeración", "10-20 raciones", "eléctrico", "Enfría rápido de 70°C a 3°C, preserva textura."),
    ("cámara de fermentación", "fermentación", "n/a", "eléctrica", "Control de T° y humedad para levado de masas."),
    ("microondas", "eléctrico", "20-30L", "800-1500W", "Recalentar, descongelar, fundir."),
    ("parrilla", "cocción", "n/a", "carbón/gas/eléctrica", "Brasas para carnes y verduras."),
    ("rustidera", "horno", "1 pieza grande", "n/a", "Asado tradicional en espetón o bandeja honda."),
    ("marmita", "utensilio", "30-100L", "gas/vapor", "Ollas grandes para fondos industriales."),
    ("colador chino", "utensilio", "n/a", "n/a", "Colado fino de salsas y fondos."),
    ("mandolina", "utensilio", "n/a", "n/a", "Cortes finos y uniformes (juliana, brunoise)."),
    ("thermomix", "eléctrico", "2L", "1000W", "多功能: triturar, emulsionar, cocinar a T° controlada."),
    ("tabla de corte", "utensilio", "n/a", "n/a", "Base para cortes de cuchillo y mandolina."),
    ("cuchillo", "utensilio", "n/a", "n/a", "Cuchillo de chef o similar."),
]

ELABORATIONS = [
    ("fondo blanco", "fondo",
     "Caldo claro hecho con huesos blanchedos, verduras aromáticas y bouquet garni. Base de muchas salsas.",
     "1L", 120, "fácil",
     "Base de la cocina francesa. Se puede congelar."),
    ("fondo oscuro", "fondo",
     "Caldo oscuro hecho con huesos asados, verduras caramelizadas y tomate.",
     "1L", 240, "media",
     "Da color y sabor intenso por la caramelización."),
    ("fondo de verduras", "fondo",
     "Caldo vegano con cebolla, puerro, zanahoria, apio y hierbas.",
     "1L", 60, "fácil",
     "Base ligera, ideal para consommés vegetarianos."),
    ("demi-glace", "salsa",
     "Reducción de fondo oscuro con vino y hierbas hasta consistencia napante.",
     "500ml", 300, "alta",
     "Salsa madre de la cocina clásica francesa."),
    ("fumet", "fondo",
     "Caldo corto de pescado blanco con verduras aromáticas y vino blanco.",
     "500ml", 45, "fácil",
     "Base para salsas de pescado y paellas de marisco."),
    ("court-bouillon", "fondo",
     "Caldo aromatizado con vinagre, vino blanco, verduras y hierbas para cocer pescados.",
     "1L", 30, "fácil",
     "Para pochados delicados de pescado."),
    ("bechamel", "salsa",
     "Salsa madre hecha con roux blanco y leche. Base de croquetas, lasañas, gratinados.",
     "500ml", 20, "fácil",
     "Una de las 5 salsas madre de la cocina francesa."),
    ("velouté", "salsa",
     "Salsa madre hecha con roux claro y caldo (blanco, oscuro o de verduras).",
     "500ml", 60, "media",
     "Ligera y brillante, base de sopas refinadas."),
    ("holandesa", "salsa",
     "Emulsión caliente de yemas y mantequilla clarificada, estabilizada con limón.",
     "200ml", 15, "alta",
     "Para huevos benedictinos, espárragos, pescados."),
    ("pesto", "salsa",
     "Salsa italiana de albahaca, piñones, parmesano, ajo y AOVE emulsionados.",
     "200ml", 10, "fácil",
     "Clásico de Génova. Mejor del día, no guardar."),
    ("salsa de tomate", "salsa",
     "Reducción de tomate fresco, cebolla, ajo y hierbas. Base italiana.",
     "500ml", 60, "fácil",
     "Para pastas, pizzas, carnes."),
    ("romesco", "salsa",
     "Salsa catalana de tomate, ñora, almendras, ajo y vinagre.",
     "300ml", 20, "fácil",
     "Acompaña calçots, carnes a la brasa."),
    ("salsa verde", "salsa",
     "Salsa emulsionada de perejil, ajo, pan, vinagre y AOVE.",
     "200ml", 15, "fácil",
     "Para merluza, kokotxas, verduras."),
    ("mayonesa", "salsa",
     "Emulsión fría de yema, aceite y limón o vinagre.",
     "200ml", 10, "media",
     "Trucos: temperatura ambiente, caída fina de aceite."),
    ("vinagreta", "aliño",
     "Emulsión simple de vinagre (o limón), AOVE y sal. Proporción 1:3.",
     "100ml", 5, "fácil",
     "Para ensaladas y crudités."),
    ("brunoise", "corte",
     "Dados pequeños de 3-5mm. Aplicado a verduras duras (zanahoria, apio).",
     "n/a", 5, "fácil",
     "Para guarniciones y presentaciones."),
    ("juliana", "corte",
     "Tiras finas de 2-3mm × 4-5cm. Para verduras y hierbas.",
     "n/a", 5, "fácil",
     "Para salteados y decoraciones."),
    ("masa madre", "masa",
     "Masa de pan fermentada con levadura madre natural. Lento pero aromático.",
     "1kg", 1440, "alta",
     "Fermentación de 12-24h. Sabor y conservación superiores."),
    ("masa de pizza", "masa",
     "Masa fermentada de harina, agua, sal y levadura. 24-48h de fermentación fría.",
     "4 bolas 250g", 1440, "media",
     "Fermentación larga = mejor sabor y corteza."),
    ("masa de empanada", "masa",
     "Masa grasa con harina, mantequilla, huevo y agua. Para rellenos dulces o salados.",
     "500g", 60, "media",
     "Reposar 30 min en frigo antes de estirar."),
    ("pasta fresca", "masa",
     "Masa de sémola y huevo. Laminada y cortada a mano o con máquina.",
     "500g", 30, "media",
     "Reposar 30 min. Cocer 2-3 min en agua hirviendo."),
    ("hojaldre", "masa",
     "Masa laminada con capas de mantequilla. Crujiente por contraste de capas.",
     "1kg", 240, "alta",
     "6 vueltas mínimo. Reposo entre vueltas."),
    ("sofrito", "preparación",
     "Base aromática de cebolla, ajo y tomate pochados lentamente en AOVE.",
     "500g", 45, "fácil",
     "Base de la cocina española, portuguesa e italiana."),
    ("mirepoix", "preparación",
     "Dados pequeños de cebolla, zanahoria y apio. Base aromática francesa.",
     "500g", 15, "fácil",
     "Para fondos y estofados."),
    ("bouquet garni", "preparación",
     "Manojo de hierbas aromáticas (laurel, tomillo, perejil) atadas con hilo.",
     "n/a", 0, "fácil",
     "Para fondos y estofados. Se retira al final."),
    ("escabeche", "conserva",
     "Conservación en vinagre aromatizado con hierbas y especias.",
     "1L", 30, "fácil",
     "Para pescados (sardinas, caballa), carnes y verduras."),
    ("salazón", "conserva",
     "Conservación por deshidratación con sal marina gruesa.",
     "n/a", 4320, "alta",
     "Base de bacalao, jamón, mojama. Días/semanas."),
    ("brandada de bacalao", "preparación",
     "Crema emulsionada de bacalao desalado, aceite de oliva y a veces leche/nata.",
     "500g", 45, "media",
     "Para untar o como guarnición. Tostar el pan para servir."),
    ("crema pastelera", "postre",
     "Crema espesada con yemas, leche, azúcar y vainilla. Base de muchos postres.",
     "500ml", 20, "media",
     "Enfriar rápido con film a piel para evitar costra."),
    ("natillas", "postre",
     "Crema suave de leche, yemas y azúcar. Similar a crema pastelera pero más ligera.",
     "500ml", 20, "fácil",
     "Servir fría con canela por encima."),
    ("merengue", "postre",
     "Claras batidas con azúcar, horneadas o flambeadas. Base de muchos postres.",
     "n/a", 15, "media",
     "Franceses (crudo, para helados) o italianos (cocido, más estables)."),
]


def seed(conn: sqlite3.Connection) -> None:
    """Borra tablas y re-puebla con el seed."""
    cursor = conn.cursor()
    # Orden inverso por FK
    for table in [
        "elaboration_machinery", "elaboration_techniques",
        "elaboration_products", "elaborations", "machinery",
        "techniques", "products",
    ]:
        cursor.execute(f"DELETE FROM {table}")
        try:
            cursor.execute("DELETE FROM sqlite_sequence WHERE name=?", (table,))
        except sqlite3.OperationalError:
            pass  # sqlite_sequence solo existe con AUTOINCREMENT

    # Inserciones masivas
    cursor.executemany(
        "INSERT INTO products (name, category, subcategory, season, notes) VALUES (?,?,?,?,?)",
        PRODUCTS,
    )
    cursor.executemany(
        "INSERT INTO techniques (name, family, description, difficulty) VALUES (?,?,?,?)",
        TECHNIQUES,
    )
    cursor.executemany(
        "INSERT INTO machinery (name, type, capacity, power, notes) VALUES (?,?,?,?,?)",
        MACHINERY,
    )
    cursor.executemany(
        "INSERT INTO elaborations (name, type, description, yield, prep_time_min, difficulty, notes) VALUES (?,?,?,?,?,?,?)",
        ELABORATIONS,
    )


def seed_relations(conn: sqlite3.Connection) -> None:
    """Define las relaciones entre elaboraciones ↔ productos/técnicas/maquinaria."""
    cursor = conn.cursor()

    def product_id(name: str) -> int:
        r = cursor.execute("SELECT id FROM products WHERE name = ?", (name,)).fetchone()
        if not r:
            raise ValueError(f"Product '{name}' no existe en el seed.")
        return r[0]

    def technique_id(name: str) -> int:
        r = cursor.execute("SELECT id FROM techniques WHERE name = ?", (name,)).fetchone()
        if not r:
            raise ValueError(f"Technique '{name}' no existe en el seed.")
        return r[0]

    def machinery_id(name: str) -> int:
        r = cursor.execute("SELECT id FROM machinery WHERE name = ?", (name,)).fetchone()
        if not r:
            raise ValueError(f"Machinery '{name}' no existe en el seed.")
        return r[0]

    def elaboration_id(name: str) -> int:
        r = cursor.execute("SELECT id FROM elaborations WHERE name = ?", (name,)).fetchone()
        if not r:
            raise ValueError(f"Elaboration '{name}' no existe en el seed.")
        return r[0]

    # Helper para insertar muchas relaciones de un tipo
    def link_products(elab_name: str, products_list: list[tuple[str, str, str, str]]) -> None:
        """products_list: [(product_name, quantity, unit, role), ...]"""
        eid = elaboration_id(elab_name)
        for prod_name, qty, unit, role in products_list:
            pid = product_id(prod_name)
            cursor.execute(
                "INSERT OR IGNORE INTO elaboration_products (elaboration_id, product_id, quantity, unit, role) VALUES (?,?,?,?,?)",
                (eid, pid, qty, unit, role),
            )

    def link_techniques(elab_name: str, techs_list: list[tuple[str, int, int | None, str]]) -> None:
        """techs_list: [(tech_name, step_order, duration_min, notes), ...]"""
        eid = elaboration_id(elab_name)
        for tech_name, step, dur, notes in techs_list:
            tid = technique_id(tech_name)
            cursor.execute(
                "INSERT OR IGNORE INTO elaboration_techniques (elaboration_id, technique_id, step_order, duration_min, notes) VALUES (?,?,?,?,?)",
                (eid, tid, step, dur, notes),
            )

    def link_machinery(elab_name: str, machs_list: list[tuple[str, int, str]]) -> None:
        """machs_list: [(mach_name, step_order, usage_notes), ...]"""
        eid = elaboration_id(elab_name)
        for mach_name, step, notes in machs_list:
            mid = machinery_id(mach_name)
            cursor.execute(
                "INSERT OR IGNORE INTO elaboration_machinery (elaboration_id, machinery_id, step_order, usage_notes) VALUES (?,?,?,?)",
                (eid, mid, step, notes),
            )

    # ── Fondos ──
    link_products("fondo blanco", [
        ("cebolla", "200", "g", "base"),
        ("zanahoria", "100", "g", "base"),
        ("apio", "100", "g", "base"),
        ("puerro", "100", "g", "base"),
        ("perejil", "1", "manojo", "aroma"),
        ("laurel", "2", "hojas", "aroma"),
        ("tomillo", "1", "rama", "aroma"),
        ("sal", "20", "g", "condimento"),
        ("pimienta negra", "5", "g", "condimento"),
    ])
    link_techniques("fondo blanco", [
        ("blancheado", 1, 10, "Blanchear huesos para clarificar."),
        ("hervido a fuego lento", 2, 90, "Cocción lenta y prolongada."),
    ])
    link_machinery("fondo blanco", [
        ("olla", 1, "Para cocción."),
        ("colador chino", 2, "Para colar al final."),
    ])

    link_products("fondo oscuro", [
        ("cebolla", "200", "g", "base"),
        ("zanahoria", "100", "g", "base"),
        ("apio", "100", "g", "base"),
        ("tomate", "100", "g", "color"),
        ("vino tinto", "200", "ml", "desglasar"),
        ("laurel", "2", "hojas", "aroma"),
        ("tomillo", "1", "rama", "aroma"),
        ("pimienta negra", "5", "g", "condimento"),
    ])
    link_techniques("fondo oscuro", [
        ("asado", 1, 45, "Asar huesos y verduras hasta caramelizar."),
        ("hervido a fuego lento", 2, 180, "Cocción muy lenta."),
    ])
    link_machinery("fondo oscuro", [
        ("rustidera", 1, "Para asar huesos y verduras."),
        ("olla", 2, "Para cocción final."),
        ("colador chino", 3, "Para colar."),
    ])

    link_products("fondo de verduras", [
        ("cebolla", "200", "g", "base"),
        ("puerro", "100", "g", "base"),
        ("zanahoria", "150", "g", "base"),
        ("apio", "150", "g", "base"),
        ("tomate", "100", "g", "base"),
        ("perejil", "1", "manojo", "aroma"),
        ("laurel", "1", "hoja", "aroma"),
        ("aceite oliva", "30", "ml", "cocción"),
    ])
    link_techniques("fondo de verduras", [
        ("salteado", 1, 10, "Sudar las verduras sin color."),
        ("hervido a fuego lento", 2, 30, "Cocción suave."),
    ])
    link_machinery("fondo de verduras", [
        ("olla", 1, None),
        ("batidora de brazo", 2, "Opcional, para textura fina."),
        ("colador chino", 3, None),
    ])

    link_products("demi-glace", [
        ("vino tinto", "250", "ml", "reducción"),
        ("cebolla", "50", "g", "aroma"),
        ("laurel", "1", "hoja", "aroma"),
        ("tomillo", "1", "rama", "aroma"),
    ])
    # demi-glace se elabora reduciendo fondo oscuro (sub-elaboración, no producto)
    link_techniques("demi-glace", [
        ("reducción", 1, 240, "Reducir hasta consistencia napante."),
    ])
    link_machinery("demi-glace", [
        ("olla", 1, None),
        ("colador chino", 2, None),
    ])

    link_products("fumet", [
        ("cebolla", "100", "g", "base"),
        ("puerro", "50", "g", "base"),
        ("vino blanco", "100", "ml", "base"),
        ("perejil", "1", "manojo", "aroma"),
        ("laurel", "1", "hoja", "aroma"),
        ("sal", "10", "g", "condimento"),
    ])
    link_techniques("fumet", [
        ("hervido a fuego lento", 1, 30, "Cocción suave sin remover."),
    ])
    link_machinery("fumet", [
        ("olla", 1, None),
        ("colador chino", 2, None),
    ])

    link_products("court-bouillon", [
        ("cebolla", "100", "g", "aroma"),
        ("zanahoria", "50", "g", "aroma"),
        ("apio", "50", "g", "aroma"),
        ("vino blanco", "200", "ml", "ácido"),
        ("vinagre balsámico", "50", "ml", "ácido"),
        ("perejil", "1", "manojo", "aroma"),
        ("laurel", "1", "hoja", "aroma"),
        ("tomillo", "1", "rama", "aroma"),
    ])
    link_techniques("court-bouillon", [
        ("hervido a fuego lento", 1, 20, "Llevar a hervor suave."),
    ])
    link_machinery("court-bouillon", [
        ("olla", 1, None),
        ("colador chino", 2, None),
    ])

    # ── Salsas ──
    link_products("bechamel", [
        ("mantequilla", "50", "g", "base"),
        ("harina", "50", "g", "base"),
        ("leche", "500", "ml", "base"),
        ("sal", "5", "g", "condimento"),
        ("pimienta negra", "1", "g", "condimento"),
    ])
    link_techniques("bechamel", [
        ("emulsionado", 1, 5, "Roux: mezclar mantequilla y harina."),
        ("hervido a fuego lento", 2, 10, "Añadir leche y cocer."),
    ])
    link_machinery("bechamel", [
        ("sartén", 1, "Para el roux."),
        ("batidora de brazo", 2, "Opcional, para textura fina."),
    ])

    link_products("velouté", [
        ("mantequilla", "50", "g", "base"),
        ("harina", "50", "g", "base"),
        ("sal", "5", "g", "condimento"),
    ])
    # velouté usa fondo blanco, oscuro o de verduras (sub-elaboración)
    link_techniques("velouté", [
        ("emulsionado", 1, 5, "Roux claro."),
        ("reducción", 2, 30, "Reducir hasta napante."),
    ])
    link_machinery("velouté", [
        ("sartén", 1, None),
        ("olla", 2, None),
    ])

    link_products("holandesa", [
        ("mantequilla", "200", "g", "base"),
        ("huevo", "3", "yemas", "emulsionante"),
        ("sal", "5", "g", "condimento"),
    ])
    link_techniques("holandesa", [
        ("emulsionado", 1, 15, "Emulsión caliente yema + mantequilla."),
        ("montar con mantequilla", 2, 5, "Terminar con mantequilla clarificada."),
    ])
    link_machinery("holandesa", [
        ("thermomix", 1, "O baño María + batidora de brazo."),
        ("batidora de brazo", 2, None),
    ])

    link_products("pesto", [
        ("albahaca", "60", "g", "principal"),
        ("aceite oliva", "100", "ml", "base"),
        ("queso curado", "50", "g", "cuerpo"),
        ("ajo", "1", "diente", "aroma"),
        ("sal", "5", "g", "condimento"),
    ])
    link_techniques("pesto", [
        ("emulsionado", 1, 10, "Triturar y emulsionar con AOVE."),
    ])
    link_machinery("pesto", [
        ("batidora de vaso", 1, None),
        ("thermomix", 2, None),
    ])

    link_products("salsa de tomate", [
        ("tomate", "1", "kg", "base"),
        ("cebolla", "200", "g", "base"),
        ("ajo", "3", "dientes", "aroma"),
        ("albahaca", "1", "ramita", "aroma"),
        ("aceite oliva", "50", "ml", "cocción"),
        ("sal", "10", "g", "condimento"),
        ("azúcar", "5", "g", "contrarrestar acidez"),
    ])
    link_techniques("salsa de tomate", [
        ("salteado", 1, 10, "Sudar cebolla y ajo."),
        ("hervido a fuego lento", 2, 30, "Reducir el tomate."),
    ])
    link_machinery("salsa de tomate", [
        ("olla", 1, None),
        ("batidora de brazo", 2, "Opcional, para textura fina."),
    ])

    link_products("romesco", [
        ("tomate", "2", "unidades", "base"),
        ("pimiento rojo", "2", "unidades", "base"),
        ("ajo", "3", "dientes", "aroma"),
        ("aceite oliva", "100", "ml", "base"),
        ("vinagre balsámico", "30", "ml", "ácido"),
        ("sal", "5", "g", "condimento"),
    ])
    link_techniques("romesco", [
        ("asado", 1, 30, "Asar pimientos y tomates."),
        ("emulsionado", 2, 5, "Triturar con AOVE."),
    ])
    link_machinery("romesco", [
        ("horno combi", 1, "Para asar."),
        ("batidora de vaso", 2, None),
    ])

    link_products("salsa verde", [
        ("perejil", "60", "g", "principal"),
        ("ajo", "2", "dientes", "aroma"),
        ("aceite oliva", "100", "ml", "base"),
        ("vinagre balsámico", "20", "ml", "ácido"),
        ("sal", "5", "g", "condimento"),
    ])
    link_techniques("salsa verde", [
        ("emulsionado", 1, 5, "Triturar todo."),
    ])
    link_machinery("salsa verde", [
        ("batidora de vaso", 1, None),
    ])

    link_products("mayonesa", [
        ("huevo", "1", "yema", "emulsionante"),
        ("aceite oliva", "200", "ml", "base"),
        ("sal", "3", "g", "condimento"),
    ])
    link_techniques("mayonesa", [
        ("emulsionado", 1, 10, "Caída fina de aceite sobre yema."),
    ])
    link_machinery("mayonesa", [
        ("batidora de brazo", 1, None),
        ("batidora de vaso", 2, None),
    ])

    link_products("vinagreta", [
        ("vinagre balsámico", "25", "ml", "ácido"),
        ("aceite oliva", "75", "ml", "base"),
        ("sal", "2", "g", "condimento"),
    ])
    link_techniques("vinagreta", [
        ("emulsionado", 1, 1, "Batir o agitar."),
    ])
    link_machinery("vinagreta", [
        ("sartén", 1, "O shaker / bote."),
    ])

    # ── Masas ──
    link_products("masa madre", [
        ("harina", "500", "g", "base"),
        ("sal", "10", "g", "condimento"),
    ])
    link_techniques("masa madre", [
        ("fermentación", 1, 1440, "Fermentación larga con madre."),
        ("asado", 2, 30, "Horneado a 220°C con vapor."),
    ])
    link_machinery("masa madre", [
        ("amasadora", 1, None),
        ("cámara de fermentación", 2, None),
        ("horno combi", 3, None),
    ])

    link_products("masa de pizza", [
        ("harina", "500", "g", "base"),
        ("aceite oliva", "30", "ml", "base"),
        ("sal", "10", "g", "condimento"),
    ])
    link_techniques("masa de pizza", [
        ("fermentación", 1, 1440, "Fermentación fría 24-48h."),
        ("asado", 2, 4, "Horno piedra 350-400°C, 3-4 min."),
    ])
    link_machinery("masa de pizza", [
        ("amasadora", 1, None),
        ("horno de piedra", 2, None),
    ])

    link_products("masa de empanada", [
        ("harina", "300", "g", "base"),
        ("mantequilla", "150", "g", "grasa"),
        ("huevo", "1", "unidad", "ligado"),
        ("sal", "5", "g", "condimento"),
    ])
    link_techniques("masa de empanada", [
        ("emulsionado", 1, 5, "Mezclar arena de harina + mantequilla."),
        ("asado", 2, 30, "180°C hasta dorada."),
    ])
    link_machinery("masa de empanada", [
        ("amasadora", 1, None),
        ("horno combi", 2, None),
    ])

    link_products("pasta fresca", [
        ("harina", "300", "g", "base"),
        ("huevo", "3", "unidades", "base"),
        ("aceite oliva", "10", "ml", "base"),
        ("sal", "3", "g", "condimento"),
    ])
    link_techniques("pasta fresca", [
        ("escalfado", 1, 3, "Cocer en agua hirviendo."),
    ])
    link_machinery("pasta fresca", [
        ("amasadora", 1, None),
        ("olla", 2, "Para cocer."),
    ])

    link_products("hojaldre", [
        ("harina", "300", "g", "base"),
        ("mantequilla", "250", "g", "laminación"),
        ("sal", "5", "g", "condimento"),
    ])
    link_techniques("hojaldre", [
        ("asado", 1, 25, "200°C hasta dorado."),
    ])
    link_machinery("hojaldre", [
        ("amasadora", 1, None),
        ("horno combi", 2, None),
    ])

    # ── Preparaciones ──
    link_products("sofrito", [
        ("cebolla", "300", "g", "base"),
        ("ajo", "5", "dientes", "aroma"),
        ("tomate", "300", "g", "base"),
        ("pimiento verde", "100", "g", "base"),
        ("aceite oliva", "50", "ml", "cocción"),
        ("sal", "5", "g", "condimento"),
    ])
    link_techniques("sofrito", [
        ("salteado", 1, 45, "Sudar todo lentamente."),
    ])
    link_machinery("sofrito", [
        ("sartén", 1, None),
        ("olla", 2, None),
    ])

    link_products("mirepoix", [
        ("cebolla", "200", "g", "base"),
        ("zanahoria", "200", "g", "base"),
        ("apio", "200", "g", "base"),
    ])
    link_techniques("mirepoix", [
        ("brunoise", 1, 15, "Corte en dados de 5mm."),
    ])
    link_machinery("mirepoix", [
        ("mandolina", 1, None),
        ("tabla de corte", 2, None),
    ])

    link_products("brunoise", [
        ("zanahoria", "100", "g", "ejemplo"),
        ("apio", "100", "g", "ejemplo"),
    ])
    link_techniques("brunoise", [
        ("brunoise", 1, 10, "Dados de 3-5mm."),
    ])
    link_machinery("brunoise", [
        ("mandolina", 1, None),
        ("cuchillo", 2, None),
    ])

    link_products("juliana", [
        ("zanahoria", "100", "g", "ejemplo"),
        ("pimiento rojo", "100", "g", "ejemplo"),
    ])
    link_techniques("juliana", [
        ("juliana", 1, 10, "Tiras finas."),
    ])
    link_machinery("juliana", [
        ("mandolina", 1, None),
    ])

    link_products("bouquet garni", [
        ("laurel", "2", "hojas", "base"),
        ("tomillo", "2", "ramas", "base"),
        ("perejil", "1", "manojo", "base"),
    ])
    link_techniques("bouquet garni", [
        ("hervido a fuego lento", 1, 0, "Mantener en líquido durante cocción."),
    ])
    link_machinery("bouquet garni", [
        ("olla", 1, None),
    ])

    link_products("escabeche", [
        ("aceite oliva", "200", "ml", "base"),
        ("vinagre balsámico", "200", "ml", "ácido"),
        ("laurel", "2", "hojas", "aroma"),
        ("pimienta negra", "5", "g", "condimento"),
    ])
    link_techniques("escabeche", [
        ("encurtido", 1, 60, "Conservar en vinagre aromatizado."),
        ("marinado", 2, 240, "Maceração para saborizar."),
    ])
    link_machinery("escabeche", [
        ("olla", 1, None),
    ])

    link_products("salazón", [
        ("sal", "1", "kg", "conservante"),
    ])
    link_techniques("salazón", [
        ("salazón", 1, 4320, "3-7 días según producto."),
    ])
    link_machinery("salazón", [
        ("cámara de fermentación", 1, "Para control de T°."),
    ])

    link_products("brandada de bacalao", [
        ("bacalao", "500", "g", "base"),
        ("aceite oliva", "200", "ml", "emulsión"),
        ("ajo", "2", "dientes", "aroma"),
        ("leche", "100", "ml", "suavizar"),
    ])
    link_techniques("brandada de bacalao", [
        ("desalado", 1, 2880, "48h en agua fría, cambiar 3-4 veces."),
        ("escalfado", 2, 10, "Cocción suave del bacalao."),
        ("emulsionado", 3, 15, "Añadir aceite en hilo emulsionando."),
    ])
    link_machinery("brandada de bacalao", [
        ("olla", 1, "Para cocción."),
        ("batidora de brazo", 2, "Para emulsionar."),
    ])

    # ── Postres ──
    link_products("crema pastelera", [
        ("leche", "500", "ml", "base"),
        ("huevo", "4", "yemas", "base"),
        ("azúcar", "100", "g", "base"),
        ("harina", "30", "g", "espesante"),
    ])
    link_techniques("crema pastelera", [
        ("hervido a fuego lento", 1, 10, "Cocinar sin dejar hervir."),
        ("emulsionado", 2, 5, "Yemas con azúcar y harina."),
    ])
    link_machinery("crema pastelera", [
        ("olla", 1, None),
        ("batidora de brazo", 2, None),
    ])

    link_products("natillas", [
        ("leche", "500", "ml", "base"),
        ("huevo", "4", "yemas", "base"),
        ("azúcar", "80", "g", "base"),
    ])
    link_techniques("natillas", [
        ("hervido a fuego lento", 1, 10, "Cocinar suave."),
    ])
    link_machinery("natillas", [
        ("olla", 1, None),
    ])

    link_products("merengue", [
        ("huevo", "4", "claras", "base"),
        ("azúcar", "200", "g", "base"),
    ])
    link_techniques("merengue", [
        ("emulsionado", 1, 15, "Montar claras a punto de nieve."),
        ("asado", 2, 60, "Horno suave 90°C."),
    ])
    link_machinery("merengue", [
        ("batidora de vaso", 1, None),
        ("horno combi", 2, None),
    ])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true",
        help="Solo verifica que el DB existe y tiene datos.",
    )
    args = parser.parse_args()

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    if args.check:
        if not DB_PATH.exists():
            print(f"❌ DB no existe en {DB_PATH}")
            return 1
        conn = sqlite3.connect(str(DB_PATH))
        try:
            n_prod = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
            n_tecn = conn.execute("SELECT COUNT(*) FROM techniques").fetchone()[0]
            n_mach = conn.execute("SELECT COUNT(*) FROM machinery").fetchone()[0]
            n_elab = conn.execute("SELECT COUNT(*) FROM elaborations").fetchone()[0]
            n_ep = conn.execute("SELECT COUNT(*) FROM elaboration_products").fetchone()[0]
            n_et = conn.execute("SELECT COUNT(*) FROM elaboration_techniques").fetchone()[0]
            n_em = conn.execute("SELECT COUNT(*) FROM elaboration_machinery").fetchone()[0]
            print(f"✅ DB OK en {DB_PATH}")
            print(f"   products:           {n_prod}")
            print(f"   techniques:         {n_tecn}")
            print(f"   machinery:          {n_mach}")
            print(f"   elaborations:       {n_elab}")
            print(f"   elaboration_products: {n_ep}")
            print(f"   elaboration_techniques: {n_et}")
            print(f"   elaboration_machinery:  {n_em}")
        finally:
            conn.close()
        return 0

    print(f"🔧 Creando DB en {DB_PATH.relative_to(PROJECT_ROOT)}")
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.executescript(SCHEMA)
        seed(conn)
        seed_relations(conn)
        conn.commit()
        print("✅ DB creada y sembrada")
        print()
        # Verificar
        n_prod = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        n_tecn = conn.execute("SELECT COUNT(*) FROM techniques").fetchone()[0]
        n_mach = conn.execute("SELECT COUNT(*) FROM machinery").fetchone()[0]
        n_elab = conn.execute("SELECT COUNT(*) FROM elaborations").fetchone()[0]
        n_ep = conn.execute("SELECT COUNT(*) FROM elaboration_products").fetchone()[0]
        n_et = conn.execute("SELECT COUNT(*) FROM elaboration_techniques").fetchone()[0]
        n_em = conn.execute("SELECT COUNT(*) FROM elaboration_machinery").fetchone()[0]
        print(f"   products:           {n_prod}")
        print(f"   techniques:         {n_tecn}")
        print(f"   machinery:          {n_mach}")
        print(f"   elaborations:       {n_elab}")
        print(f"   elaboration_products: {n_ep}")
        print(f"   elaboration_techniques: {n_et}")
        print(f"   elaboration_machinery:  {n_em}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
