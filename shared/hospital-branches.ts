import type { HospitalBranchId } from './types';

export interface HospitalBranchMeta {
  id: HospitalBranchId;
  name_en: string;
  name_ar: string;
}

/** The six real branch sites the hospital network's NPHIES/Oracle Health bridge covers. */
export const HOSPITAL_BRANCHES: HospitalBranchMeta[] = [
  { id: 'riyadh', name_en: 'Riyadh', name_ar: 'الرياض' },
  { id: 'madinah', name_en: 'Madinah', name_ar: 'المدينة المنورة' },
  { id: 'unaizah', name_en: 'Unaizah', name_ar: 'عنيزة' },
  { id: 'khamis', name_en: 'Khamis Mushait', name_ar: 'خميس مشيط' },
  { id: 'jizan', name_en: 'Jizan', name_ar: 'جازان' },
  { id: 'abha', name_en: 'Abha', name_ar: 'أبها' },
];

export function findBranch(id: string | undefined): HospitalBranchMeta | undefined {
  return HOSPITAL_BRANCHES.find((b) => b.id === id);
}
