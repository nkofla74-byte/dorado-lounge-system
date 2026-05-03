import type {
  Receta,
  RecetaIngrediente,
  RecetaWithIngredientes,
  CreateRecetaInput,
  AddIngredienteInput,
} from '../../domain/recipe';

export interface RecipeRepository {
  findAll(tenantId: string): Promise<RecetaWithIngredientes[]>;
  create(tenantId: string, input: CreateRecetaInput): Promise<Receta>;
  addIngrediente(tenantId: string, input: AddIngredienteInput): Promise<RecetaIngrediente>;
}
