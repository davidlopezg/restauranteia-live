// Tipos de Imagen. Espejo de admin-web/backend/queries.py (idea_images, agenda_images, catalogo_images).

export type ImageSourceType = "block_image" | "property";

export interface EntityImage {
    id: string;
    /** ID de la entidad padre (idea_id / agenda_id / catalogo_id). */
    entity_id: string;
    source_type: ImageSourceType;
    notion_block_id: string | null;
    notion_page_id: string;
    notion_property: string | null;
    storage_bucket: string;
    storage_path: string;
    storage_url_public: string | null;
    original_filename: string | null;
    mime_type: string | null;
    file_size_bytes: number | null;
    sha256: string | null;
    position: number | null;
    has_caption: boolean | null;
    migrated_at: string;
}

export interface SignedUrlResponse {
    url: string;
}
