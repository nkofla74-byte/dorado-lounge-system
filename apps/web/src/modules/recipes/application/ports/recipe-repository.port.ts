import type {
  Receta,
  RecetaIngrediente,
  RecetaWithIngredientes,
  CreateRecetaInput,
  AddIngredienteInput,
  UpdateMenuMetaInput,
} from '../../domain/recipe';

export interface RecipeRepository {
  findAll(tenantId: string): Promise<RecetaWithIngredientes[]>;
  create(tenantId: string, input: CreateRecetaInput): Promise<Receta>;
  addIngrediente(tenantId: string, input: AddIngredienteInput): Promise<RecetaIngrediente>;
  updateMenuMeta(tenantId: string, input: UpdateMenuMetaInput): Promise<void>;
}
