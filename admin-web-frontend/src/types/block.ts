// Tipos de Bloques Notion. Espejo de admin-web/backend/queries.py (idea_blocks, agenda_blocks, catalogo_blocks).

export type BlockType =
    | "paragraph"
    | "heading_1"
    | "heading_2"
    | "heading_3"
    | "bulleted_list_item"
    | "numbered_list_item"
    | "divider"
    | "code"
    | "embed"
    | "image"
    | "video";

export interface Block {
    id: string;
    /** ID de la entidad padre (idea_id / agenda_id / catalogo_id). */
    parent_id: string;
    notion_block_id: string;
    block_type: BlockType;
    position: number;
    parent_block_id: string | null;
    content_text: string | null;
    content_raw: unknown;
    has_children: boolean | null;
    code_language: string | null;
    embed_url: string | null;
    is_broken: boolean | null;
    video_url: string | null;
    video_source_type: string | null;
    image_source_type: string | null;
    migrated_at: string;
    migration_run_id: string;
}
