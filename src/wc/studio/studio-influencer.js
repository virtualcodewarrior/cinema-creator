// Port of packages/studio/src/components/AiInfluencerStudio.jsx.
// Three-panel character builder: options tabs (left), live preview (center),
// generated gallery (right).
//
// Porting notes:
// - No localStorage persistence (the original keeps history in state only).
// - HoverPill is a tiny component with its own hover state; here a single
//   `hoveredTag` state tracks which tag pill is hovered.
// - `errorMsg` mirrors the original, which resets it to "" but never assigns
//   the caught message (error surfaces via the toaster / onGenerationError).
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';
import { generateImage } from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
import {
  GenerationCopyButtons,
  MobileGenerationActions,
} from './mobile-generation-actions.js';

const CDN = '/assets/influencer';

// ── Default image generation model ──────────────────────────────────────────
const INFLUENCER_MODEL = 'nano-banana-pro';

const TABS_CONFIG = {
  face: {
    label: 'Face',
    subcategories: [
      {
        id: 'character_type',
        label: 'Character Type',
        options: [
          { id: 'human', label: 'Human', img: `${CDN}/character_type_human.webp`, promptVal: 'human features' },
          { id: 'elf', label: 'Elf', img: `${CDN}/character_type_elf.webp`, promptVal: 'elf with pointed ears' },
          { id: 'alien', label: 'Alien', img: `${CDN}/character_type_alien.webp`, promptVal: 'alien creature' },
          { id: 'amphibian', label: 'Amphibian', img: `${CDN}/character_type_amphibian.webp`, promptVal: 'amphibian humanoid' },
          { id: 'reptile', label: 'Reptile', img: `${CDN}/character_type_reptile.webp`, promptVal: 'reptilian creature' },
          { id: 'mantis', label: 'Mantis', img: `${CDN}/character_type_mantis.webp`, promptVal: 'mantis hybrid character' },
          { id: 'bee', label: 'Bee', img: `${CDN}/character_type_bee.webp`, promptVal: 'bee insect hybrid character' },
          { id: 'octopus', label: 'Octopus', img: `${CDN}/character_type_octopus.webp`, promptVal: 'aquatic octopus hybrid' },
          { id: 'crocodile', label: 'Crocodile', img: `${CDN}/character_type_crocodile.webp`, promptVal: 'crocodile humanoid' },
          { id: 'iguana', label: 'Iguana', img: `${CDN}/character_type_iguana.webp`, promptVal: 'iguana humanoid' },
          { id: 'lizard', label: 'Lizard', img: `${CDN}/character_type_lizard.webp`, promptVal: 'lizard humanoid' },
          { id: 'rhinoceros_beetle', label: 'Beetle', img: `${CDN}/character_type_rhinoceros_beetle.webp`, promptVal: 'rhinoceros beetle humanoid' },
          { id: 'ant', label: 'Ant', img: `${CDN}/character_type_ant.webp`, promptVal: 'ant hybrid character' },
        ],
      },
      {
        id: 'gender',
        label: 'Gender',
        options: [
          { id: 'female', label: 'Female', img: `${CDN}/gender_female.webp`, promptVal: 'female' },
          { id: 'male', label: 'Male', img: `${CDN}/gender_male.webp`, promptVal: 'male' },
          { id: 'non_binary', label: 'Non-binary', img: `${CDN}/gender_non_binary.webp`, promptVal: 'non-binary character' },
          { id: 'trans_man', label: 'Trans Man', img: `${CDN}/gender_trans_man.webp`, promptVal: 'transgender man' },
          { id: 'trans_woman', label: 'Trans Woman', img: `${CDN}/gender_trans_woman.webp`, promptVal: 'transgender woman' },
        ],
      },
      {
        id: 'ethnicity_origin_base',
        label: 'Ethnicity / Origin',
        options: [
          { id: 'african', label: 'African', img: `${CDN}/ethnicity_origin_base_african.webp`, promptVal: 'african heritage' },
          { id: 'asian', label: 'Asian', img: `${CDN}/ethnicity_origin_base_recreate_in_east_asian_supermodel__korea.webp`, promptVal: 'East Asian supermodel, Korean K-Pop Idol phenotype' },
          { id: 'european', label: 'European', img: `${CDN}/ethnicity_origin_base_scandinavian_supermodel.webp`, promptVal: 'Scandinavian Supermodel' },
          { id: 'indian', label: 'Indian', img: `${CDN}/ethnicity_origin_base_indian.webp`, promptVal: 'south asian indian heritage' },
          { id: 'middle_eastern', label: 'Middle Eastern', img: `${CDN}/ethnicity_origin_base_middle_eastern.webp`, promptVal: 'middle eastern heritage' },
          { id: 'mixed', label: 'Mixed', img: `${CDN}/ethnicity_origin_base_mixed.webp`, promptVal: 'multiracial mixed heritage' },
        ],
      },
      {
        id: 'eye_color',
        label: 'Eye Color',
        options: [
          { id: 'eye_blue', label: 'Blue', img: `${CDN}/eye_color_eye_blue.webp`, promptVal: 'striking blue eyes' },
          { id: 'eye_brown', label: 'Brown', img: `${CDN}/eye_color_eye_brown.webp`, promptVal: 'warm brown eyes' },
          { id: 'eye_green', label: 'Green', img: `${CDN}/eye_color_eye_green.webp`, promptVal: 'emerald green eyes' },
          { id: 'eye_amber', label: 'Amber', img: `${CDN}/eye_color_eye_amber.webp`, promptVal: 'amber eyes' },
          { id: 'eye_grey', label: 'Grey', img: `${CDN}/eye_color_eye_grey.webp`, promptVal: 'grey eyes' },
          { id: 'eye_red', label: 'Red', img: `${CDN}/eye_color_eye_red.webp`, promptVal: 'red eyes' },
          { id: 'eye_purple', label: 'Purple', img: `${CDN}/eye_color_eye_purple.webp`, promptVal: 'violet purple eyes' },
          { id: 'eye_black', label: 'Black', img: `${CDN}/eye_color_eye_black.webp`, promptVal: 'black eyes' },
          { id: 'eye_deep_brown', label: 'Deep Brown', img: `${CDN}/eye_color_eye_deep_brown.webp`, promptVal: 'deep dark brown eyes' },
          { id: 'eye_white', label: 'White', img: `${CDN}/eye_color_eye_white.webp`, promptVal: 'white eyes' },
          { id: 'eye_black_void', label: 'Solid Black', img: `${CDN}/eye_color_eye_black_void.webp`, promptVal: 'solid black void eyes' },
          { id: 'eye_white_void', label: 'Blind / Empty', img: `${CDN}/eye_color_eye_white_void.webp`, promptVal: 'blind empty white eyes' },
        ],
      },
      {
        id: 'eyes_type',
        label: 'Eye Type',
        options: [
          { id: 'eyes_human', label: 'Human', img: `${CDN}/eyes_type_eyes_human.webp`, promptVal: 'normal human eyes' },
          { id: 'eyes_reptile', label: 'Reptile', img: `${CDN}/eyes_type_eyes_reptile.webp`, promptVal: 'reptile slit-pupil eyes' },
          { id: 'eyes_mechanical', label: 'Mechanical', img: `${CDN}/eyes_type_eyes_mechanical.webp`, promptVal: 'mechanical cyborg eyes' },
        ],
      },
      {
        id: 'eyes_details',
        label: 'Eye Features',
        options: [
          { id: 'eyes_different_colors', label: 'Heterochromia', img: `${CDN}/eyes_details_eyes_different_colors.webp`, promptVal: 'heterochromia different eye colors' },
          { id: 'eyes_blind', label: 'Blind Eye', img: `${CDN}/eyes_details_eyes_blind.webp`, promptVal: 'one cloudy blind eye' },
          { id: 'eyes_scarred', label: 'Scarred Eye', img: `${CDN}/eyes_details_eyes_scarred.webp`, promptVal: 'scar running across one eye' },
          { id: 'eyes_glowing', label: 'Glowing Eye', img: `${CDN}/eyes_details_eyes_glowing.webp`, promptVal: 'glowing magical eyes' },
        ],
      },
      {
        id: 'mouth',
        label: 'Mouth & Teeth',
        options: [
          { id: 'mouth_small', label: 'Small Mouth', img: `${CDN}/mouth_mouth_small.webp`, promptVal: 'small delicate mouth' },
          { id: 'mouth_large', label: 'Large Mouth', img: `${CDN}/mouth_mouth_large.webp`, promptVal: 'wide expressive mouth' },
          { id: 'mouth_no_teeth', label: 'No Teeth', img: `${CDN}/mouth_mouth_no_teeth.webp`, promptVal: 'no visible teeth' },
          { id: 'mouth_different_teeth', label: 'Unique Teeth', img: `${CDN}/mouth_mouth_different_teeth.webp`, promptVal: 'unusual tooth structure' },
          { id: 'mouth_sharp_teeth', label: 'Sharp Teeth', img: `${CDN}/mouth_mouth_sharp_teeth.webp`, promptVal: 'sharp predatory fangs' },
          { id: 'mouth_forked_tongue', label: 'Forked Tongue', img: `${CDN}/mouth_mouth_forked_tongue.webp`, promptVal: 'reptilian forked tongue' },
          { id: 'mouth_two_tongues', label: 'Two Tongues', img: `${CDN}/mouth_mouth_two_tongues.webp`, promptVal: 'two separate tongues' },
        ],
      },
      {
        id: 'ears',
        label: 'Ears',
        options: [
          { id: 'ears_human', label: 'Human', img: `${CDN}/ears_ears_human.webp`, promptVal: 'normal human ears' },
          { id: 'ears_elf', label: 'Elf Ears', img: `${CDN}/ears_ears_elf.webp`, promptVal: 'pointed elf ears' },
          { id: 'ears_no', label: 'No Ears', img: `${CDN}/ears_ears_no.webp`, promptVal: 'no visible ears' },
          { id: 'ears_wings', label: 'Wing Ears', img: `${CDN}/ears_ears_wings.webp`, promptVal: 'wing ears' },
        ],
      },
      {
        id: 'horns',
        label: 'Horns',
        options: [
          { id: 'small_horns', label: 'Small Horns', img: `${CDN}/horns_small_horns.webp`, promptVal: 'small horns on forehead' },
          { id: 'big_horns', label: 'Big Horns', img: `${CDN}/horns_big_horns.webp`, promptVal: 'large curved horns' },
          { id: 'antlers', label: 'Antlers', img: `${CDN}/horns_antlers.webp`, promptVal: 'deer antlers on head' },
        ],
      },
      {
        id: 'skin_conditions',
        label: 'Skin Conditions',
        options: [
          { id: 'condition_vitiligo', label: 'Vitiligo', img: `${CDN}/skin_conditions_condition_vitiligo.webp`, promptVal: 'vitiligo skin condition' },
          { id: 'condition_pigmentation', label: 'Pigmentation', img: `${CDN}/skin_conditions_condition_pigmentation.webp`, promptVal: 'hyperpigmentation' },
          { id: 'condition_freckles', label: 'Freckles', img: `${CDN}/skin_conditions_condition_freckles.webp`, promptVal: 'freckled skin' },
          { id: 'condition_birthmarks', label: 'Birthmarks', img: `${CDN}/skin_conditions_condition_birthmarks.webp`, promptVal: 'visible birthmarks' },
          { id: 'condition_scars', label: 'Scars', img: `${CDN}/skin_conditions_condition_scars.webp`, promptVal: 'scarred skin' },
          { id: 'condition_burns', label: 'Burns', img: `${CDN}/skin_conditions_condition_burns.webp`, promptVal: 'burn marks on skin' },
          { id: 'condition_albinism', label: 'Albinism', img: `${CDN}/skin_conditions_condition_albinism.webp`, promptVal: 'albinism pale white skin' },
          { id: 'condition_cracked', label: 'Cracked Skin', img: `${CDN}/skin_conditions_condition_cracked.webp`, promptVal: 'cracked dry skin texture' },
          { id: 'condition_wrinkled', label: 'Wrinkled', img: `${CDN}/skin_conditions_condition_wrinkled.webp`, promptVal: 'wrinkled aged skin' },
        ],
      },
    ],
  },
  body: {
    label: 'Body',
    subcategories: [
      {
        id: 'face_skin_material',
        label: 'Face Skin Material',
        options: [
          { id: 'face_skin_human', label: 'Human Skin', img: `${CDN}/face_skin_material_face_skin_human.webp`, promptVal: 'smooth human skin' },
          { id: 'face_skin_scales', label: 'Scales', img: `${CDN}/face_skin_material_face_skin_scales.webp`, promptVal: 'shimmering scales' },
          { id: 'face_skin_fur', label: 'Fur', img: `${CDN}/face_skin_material_face_skin_fur.webp`, promptVal: 'soft fur covered face' },
          { id: 'face_skin_amphibian', label: 'Amphibian', img: `${CDN}/face_skin_material_face_skin_amphibian.webp`, promptVal: 'smooth moist amphibian skin' },
          { id: 'face_skin_fish', label: 'Fish Skin', img: `${CDN}/face_skin_material_face_skin_fish.webp`, promptVal: 'iridescent fish scale skin' },
          { id: 'face_skin_metallic', label: 'Metallic', img: `${CDN}/face_skin_material_face_skin_metallic.webp`, promptVal: 'polished metallic skin' },
        ],
      },
      {
        id: 'face_surface_pattern',
        label: 'Skin Pattern',
        options: [
          { id: 'face_pattern_solid', label: 'Solid', img: `${CDN}/face_surface_pattern_face_pattern_solid.webp`, promptVal: 'solid color skin' },
          { id: 'face_pattern_stripes', label: 'Stripes', img: `${CDN}/face_surface_pattern_face_pattern_stripes.webp`, promptVal: 'exotic striped skin pattern' },
          { id: 'face_pattern_spots', label: 'Spots', img: `${CDN}/face_surface_pattern_face_pattern_spots.webp`, promptVal: 'dappled spotted skin' },
          { id: 'face_pattern_chess', label: 'Chess', img: `${CDN}/face_surface_pattern_face_pattern_chess.webp`, promptVal: 'checkerboard skin pattern' },
          { id: 'face_pattern_veins', label: 'Veins', img: `${CDN}/face_surface_pattern_face_pattern_veins.webp`, promptVal: 'translucent skin with neon veins' },
          { id: 'face_pattern_gradient', label: 'Gradient', img: `${CDN}/face_surface_pattern_face_pattern_gradient.webp`, promptVal: 'gradient skin coloring' },
          { id: 'face_pattern_giraffe', label: 'Giraffe', img: `${CDN}/face_surface_pattern_face_pattern_giraffe.webp`, promptVal: 'giraffe print skin markings' },
        ],
      },
      {
        id: 'body_type',
        label: 'Body Type',
        options: [
          { id: 'body_slim', label: 'Slim', img: `${CDN}/body_type_body_slim.webp`, promptVal: 'slim slender physique' },
          { id: 'body_lean', label: 'Lean', img: `${CDN}/body_type_body_lean.webp`, promptVal: 'lean toned physique' },
          { id: 'body_athletic', label: 'Athletic', img: `${CDN}/body_type_body_athletic.webp`, promptVal: 'fit athletic body' },
          { id: 'body_muscular', label: 'Muscular', img: `${CDN}/body_type_body_muscular.webp`, promptVal: 'strong muscular build' },
          { id: 'body_curvy', label: 'Curvy', img: `${CDN}/body_type_body_curvy.webp`, promptVal: 'curvy body type' },
          { id: 'body_heavy', label: 'Heavy', img: `${CDN}/body_type_body_heavy.webp`, promptVal: 'heavy set build' },
          { id: 'body_skinny', label: 'Skinny', img: `${CDN}/body_type_body_skinny.webp`, promptVal: 'very skinny thin build' },
        ],
      },
      {
        id: 'left_arm',
        label: 'Left Arm',
        options: [
          { id: 'left_arm_normal', label: 'Normal', img: `${CDN}/left_arm_left_arm_normal.webp`, promptVal: 'normal left arm' },
          { id: 'left_arm_cute', label: 'Cute Prosthetic', img: `${CDN}/left_arm_make_left_arm_stylish_pink_prosthetic_wi.webp`, promptVal: 'stylish pink prosthetic left arm with cute stickers' },
          { id: 'left_arm_robotic', label: 'Robotic', img: `${CDN}/left_arm_left_arm_robotic.webp`, promptVal: 'robotic left arm' },
          { id: 'left_arm_prosthetic', label: 'Prosthetic', img: `${CDN}/left_arm_left_arm_prosthetic.webp`, promptVal: 'prosthetic left arm' },
          { id: 'left_arm_mechanical', label: 'Mechanical', img: `${CDN}/left_arm_left_arm_mechanical.webp`, promptVal: 'mechanical left arm' },
          { id: 'left_arm_none', label: 'None', img: `${CDN}/left_arm_left_arm_none.webp`, promptVal: 'no left arm' },
        ],
      },
      {
        id: 'right_arm',
        label: 'Right Arm',
        options: [
          { id: 'right_arm_normal', label: 'Normal', img: `${CDN}/right_arm_right_arm_normal.webp`, promptVal: 'normal right arm' },
          { id: 'right_arm_cute', label: 'Cute Prosthetic', img: `${CDN}/right_arm_make_right_arm_stylish_pink_prosthetic_w.webp`, promptVal: 'stylish pink prosthetic right arm with cute stickers' },
          { id: 'right_arm_robotic', label: 'Robotic', img: `${CDN}/right_arm_right_arm_robotic.webp`, promptVal: 'robotic right arm' },
          { id: 'right_arm_prosthetic', label: 'Prosthetic', img: `${CDN}/right_arm_right_arm_prosthetic.webp`, promptVal: 'prosthetic right arm' },
          { id: 'right_arm_mechanical', label: 'Mechanical', img: `${CDN}/right_arm_right_arm_mechanical.webp`, promptVal: 'mechanical right arm' },
          { id: 'right_arm_none', label: 'None', img: `${CDN}/right_arm_right_arm_none.webp`, promptVal: 'no right arm' },
        ],
      },
      {
        id: 'left_leg',
        label: 'Left Leg',
        options: [
          { id: 'left_leg_normal', label: 'Normal', img: `${CDN}/left_leg_left_leg_normal.webp`, promptVal: 'normal left leg' },
          { id: 'left_leg_cute', label: 'Cute Prosthetic', img: `${CDN}/left_leg_make_left_leg_stylish_pink_prosthetic_wi.webp`, promptVal: 'stylish pink prosthetic left leg with cute stickers' },
          { id: 'left_leg_robotic', label: 'Robotic', img: `${CDN}/left_leg_left_leg_robotic.webp`, promptVal: 'robotic left leg' },
          { id: 'left_leg_prosthetic', label: 'Prosthetic', img: `${CDN}/left_leg_left_leg_prosthetic.webp`, promptVal: 'prosthetic left leg' },
          { id: 'left_leg_mechanical', label: 'Mechanical', img: `${CDN}/left_leg_left_leg_mechanical.webp`, promptVal: 'mechanical left leg' },
          { id: 'left_leg_none', label: 'None', img: `${CDN}/left_leg_left_leg_none.webp`, promptVal: 'no left leg' },
        ],
      },
      {
        id: 'right_leg',
        label: 'Right Leg',
        options: [
          { id: 'right_leg_normal', label: 'Normal', img: `${CDN}/right_leg_right_leg_normal.webp`, promptVal: 'normal right leg' },
          { id: 'right_leg_cute', label: 'Cute Prosthetic', img: `${CDN}/right_leg_make_right_leg_stylish_pink_prosthetic_w.webp`, promptVal: 'stylish pink prosthetic right leg with cute stickers' },
          { id: 'right_leg_robotic', label: 'Robotic', img: `${CDN}/right_leg_right_leg_robotic.webp`, promptVal: 'robotic right leg' },
          { id: 'right_leg_prosthetic', label: 'Prosthetic', img: `${CDN}/right_leg_right_leg_prosthetic.webp`, promptVal: 'prosthetic right leg' },
          { id: 'right_leg_mechanical', label: 'Mechanical', img: `${CDN}/right_leg_right_leg_mechanical.webp`, promptVal: 'mechanical right leg' },
          { id: 'right_leg_none', label: 'None', img: `${CDN}/right_leg_right_leg_none.webp`, promptVal: 'no right leg' },
        ],
      },
    ],
  },
  style: {
    label: 'Style',
    subcategories: [
      {
        id: 'hair',
        label: 'Hair / Head Growth',
        options: [
          { id: 'hair_bald', label: 'Bald', img: `${CDN}/hair_hair_bald.webp`, promptVal: 'bald head' },
          { id: 'hair_short', label: 'Short Hair', img: `${CDN}/hair_hair_short.webp`, promptVal: 'short hair' },
          { id: 'hair_long', label: 'Long Hair', img: `${CDN}/hair_hair_long.webp`, promptVal: 'long flowing hair' },
          { id: 'hair_afro', label: 'Afro', img: `${CDN}/hair_hair_afro.webp`, promptVal: 'afro hairstyle' },
          { id: 'hair_punk', label: 'Punk', img: `${CDN}/hair_hair_punk.webp`, promptVal: 'punk mohawk hairstyle' },
          { id: 'hair_fur', label: 'Fur / Mane', img: `${CDN}/hair_hair_fur.webp`, promptVal: 'fur mane on head' },
          { id: 'hair_tentacles', label: 'Tentacles', img: `${CDN}/hair_hair_tentacles.webp`, promptVal: 'tentacles as hair' },
          { id: 'hair_spines', label: 'Spines', img: `${CDN}/hair_hair_spines.webp`, promptVal: 'spines as hair' },
        ],
      },
      {
        id: 'accessories',
        label: 'Accessories & Markings',
        options: [
          { id: 'accessory_tattoos', label: 'Tattoos', img: `${CDN}/accessories_accessory_tattoos.webp`, promptVal: 'covered in tattoos' },
          { id: 'accessory_piercing', label: 'Piercings', img: `${CDN}/accessories_accessory_piercing.webp`, promptVal: 'multiple piercings' },
          { id: 'accessory_scarification', label: 'Scarification', img: `${CDN}/accessories_accessory_scarification.webp`, promptVal: 'ritual scarification marks' },
          { id: 'accessory_symbols', label: 'Symbols / Markings', img: `${CDN}/accessories_accessory_symbols.webp`, promptVal: 'symbolic tribal markings' },
          { id: 'accessory_cyber', label: 'Cyber Markings', img: `${CDN}/accessories_accessory_cyber.webp`, promptVal: 'cyberpunk circuit markings' },
        ],
      },
      {
        id: 'rendering_style',
        label: 'Rendering Style',
        options: [
          { id: 'style_hyper_realistic', label: 'Hyper-Realistic', img: `${CDN}/character_type_human.webp`, promptVal: 'hyper-realistic 8k photograph' },
          { id: 'style_anime', label: 'Anime', img: `${CDN}/character_type_elf.webp`, promptVal: 'anime art style' },
          { id: 'style_cartoon', label: 'Cartoon', img: `${CDN}/character_type_mantis.webp`, promptVal: 'cartoon illustration style' },
          { id: 'style_2d', label: '2D Illustration', img: `${CDN}/character_type_alien.webp`, promptVal: '2D flat illustration style' },
        ],
      },
    ],
  },
};

// ─── SVG Icons ──────────────────────────────────────────────────────────────
const svgOf = (markup) => unsafeHTML(markup);

const ShuffleIcon = svgOf(
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />' +
    '<polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />' +
    '</svg>',
);
const BoltIcon = svgOf(
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M13 10V3L4 14h7v7l9-11h-7z" />' +
    '</svg>',
);
const CheckIcon = svgOf(
  '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="20 6 9 17 4 12" />' +
    '</svg>',
);
const DownloadIcon = svgOf(
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />' +
    '</svg>',
);

export class StudioInfluencer extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    // White-label contract props (were React props).
    apiKey: { type: String },
    onGenerate: { attribute: false },
    onGenerationStart: { attribute: false },
    onGenerationEnd: { attribute: false },
    onGenerationComplete: { attribute: false },
    onGenerationError: { attribute: false },
    isGenerating: { attribute: false },

    activeTab: { state: true },
    selectedOptions: { state: true },
    aspectRatio: { state: true },
    customPrompt: { state: true },
    isGeneratingInternal: { state: true },
    currentResult: { state: true },
    history: { state: true },
    selectedHistoryIdx: { state: true },
    errorMsg: { state: true },
    showAllTags: { state: true },
    hoveredTag: { state: true },
  };

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
      }
    `,
  ];

  constructor() {
    super();
    this.apiKey = '';
    this.onGenerate = null;
    this.onGenerationStart = null;
    this.onGenerationEnd = null;
    this.onGenerationComplete = null;
    this.onGenerationError = null;
    this.isGenerating = false;

    this.activeTab = 'face';
    this.selectedOptions = this._defaultOptions();
    this.aspectRatio = '3:4';
    this.customPrompt = '';
    this.isGeneratingInternal = false;
    this.currentResult = null;
    this.history = [];
    this.selectedHistoryIdx = null;
    this.errorMsg = '';
    this.showAllTags = false;
    this.hoveredTag = null;
  }

  // First option of every subcategory (matches the React useState initializer).
  _defaultOptions() {
    const init = {};
    Object.values(TABS_CONFIG).forEach((tab) =>
      tab.subcategories.forEach((sub) => {
        if (sub.options?.length > 0) init[sub.id] = sub.options[0].id;
      }),
    );
    return init;
  }

  get isGeneratingNow() {
    return this.isGenerating || this.isGeneratingInternal;
  }

  buildPrompt() {
    const parts = [];
    Object.values(TABS_CONFIG).forEach((tab) =>
      tab.subcategories.forEach((sub) => {
        const opt = sub.options.find((o) => o.id === this.selectedOptions[sub.id]);
        if (opt?.promptVal) parts.push(opt.promptVal);
      }),
    );
    let prompt =
      'Ultra-realistic professional portrait photograph of an AI influencer character, 8k resolution, cinematic lighting, sharp detail';
    if (parts.length) prompt += ', ' + parts.join(', ');
    if (this.customPrompt.trim()) prompt += ', ' + this.customPrompt.trim();
    return prompt;
  }

  handleOptionSelect(subcatId, optId) {
    this.selectedOptions = { ...this.selectedOptions, [subcatId]: optId };
  }

  handleShuffle() {
    const next = {};
    Object.values(TABS_CONFIG).forEach((tab) =>
      tab.subcategories.forEach((sub) => {
        if (sub.options?.length > 0)
          next[sub.id] = sub.options[Math.floor(Math.random() * sub.options.length)].id;
      }),
    );
    this.selectedOptions = next;
  }

  async handleGenerate() {
    if (this.isGeneratingNow) return;
    this.onGenerationStart?.();
    this.isGeneratingInternal = true;
    this.errorMsg = '';

    const prompt = this.buildPrompt();
    try {
      let res;
      if (this.onGenerate) {
        res = await this.onGenerate({
          prompt,
          aspectRatio: this.aspectRatio,
          selections: this.selectedOptions,
        });
      } else {
        res = await generateImage(this.apiKey, {
          model: INFLUENCER_MODEL,
          prompt,
          aspect_ratio: this.aspectRatio,
        });
      }
      if (res?.url) {
        this.currentResult = res.url;
        this.history = [{ url: res.url, prompt, ts: Date.now() }, ...this.history];
        this.selectedHistoryIdx = 0;
        this.onGenerationComplete?.({
          url: res.url,
          model: INFLUENCER_MODEL,
          prompt,
          type: 'image',
        });
      }
    } catch (err) {
      const message = formatErrorMessage(err, 'Generation failed. Please try again.');
      if (this.onGenerationError) this.onGenerationError(message);
      else toast.error(message);
    } finally {
      this.isGeneratingInternal = false;
      this.onGenerationEnd?.();
    }
  }

  async downloadImg(url) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ai-influencer-${Date.now()}.webp`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  }

  get previewUrl() {
    return this.selectedHistoryIdx !== null && this.history[this.selectedHistoryIdx]
      ? this.history[this.selectedHistoryIdx].url
      : this.currentResult;
  }

  get selectedTags() {
    const tags = [];
    Object.keys(TABS_CONFIG).forEach((tabKey) => {
      TABS_CONFIG[tabKey].subcategories.forEach((sub) => {
        const selId = this.selectedOptions[sub.id];
        const opt = sub.options.find((o) => o.id === selId);
        if (opt) tags.push({ subcatId: sub.id, label: opt.label, img: opt.img });
      });
    });
    return tags;
  }

  render() {
    const arMap = { '3:4': '3/4', '1:1': '1/1', '9:16': '9/16', '16:9': '16/9' };
    const TAGS_VISIBLE = 7;
    const generating = this.isGeneratingNow;
    const tags = this.selectedTags;
    const visibleTags = this.showAllTags ? tags : tags.slice(0, TAGS_VISIBLE);

    return html`
      <div class="flex h-full bg-[#0a0a0a] text-white overflow-hidden select-none font-sans">
        <!-- LEFT — Builder / Options Panel -->
        <div class="flex flex-col w-[320px] shrink-0 border-r border-white/[0.07] bg-[#111111] overflow-hidden">
          <!-- Builder header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] shrink-0">
            <span class="text-[13px] font-bold text-white tracking-tight">Builder</span>
            <button
              @click=${() => (this.selectedOptions = this._defaultOptions())}
              class="text-[11px] text-gray-500 hover:text-white transition-colors font-medium"
            >
              Reset
            </button>
          </div>

          <!-- Tab pills -->
          <div class="flex gap-1 px-3 py-2 border-b border-white/[0.07] shrink-0">
            ${Object.keys(TABS_CONFIG).map(
              (key) => html`
                <button
                  @click=${() => (this.activeTab = key)}
                  class="flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                    this.activeTab === key
                      ? 'bg-white text-black shadow'
                      : 'text-gray-500 hover:text-white hover:bg-white/[0.06]'
                  }"
                >
                  ${TABS_CONFIG[key].label}
                </button>
              `,
            )}
          </div>

          <!-- Subcategory options scroll area -->
          <div class="flex-1 overflow-y-auto p-3 space-y-5">
            ${TABS_CONFIG[this.activeTab]?.subcategories?.map((subcat) => html`
              <div>
                <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-0.5">
                  ${subcat.label}
                </p>
                <div class="grid grid-cols-3 gap-1.5">
                  ${subcat.options?.map((opt) => {
                    const sel = this.selectedOptions[subcat.id] === opt.id;
                    return html`
                      <button
                        @click=${() => this.handleOptionSelect(subcat.id, opt.id)}
                        class="group relative aspect-square rounded-xl overflow-hidden border transition-all ${
                          sel
                            ? 'border-white/80 ring-1 ring-white/30 shadow-lg'
                            : 'border-white/[0.08] hover:border-white/25'
                        }"
                      >
                        <img
                          src=${opt.img}
                          alt=${opt.label}
                          loading="lazy"
                          class="w-full h-full object-cover"
                          @error=${(e) => {
                            e.target.onerror = null;
                            e.target.src = `${CDN}/character_type_human.webp`;
                          }}
                        />
                        <!-- Label overlay -->
                        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-4 pb-1 px-1">
                          <span class="text-[9px] font-semibold text-white leading-none">${opt.label}</span>
                        </div>
                        <!-- Selected check badge -->
                        ${sel
                          ? html`
                              <div class="absolute top-1 right-1 w-4 h-4 rounded-full bg-white text-black flex items-center justify-center">
                                ${CheckIcon}
                              </div>
                            `
                          : nothing}
                      </button>
                    `;
                  })}
                </div>
              </div>
            `)}
          </div>
        </div>

        <!-- CENTER — Current Character Preview -->
        <div class="flex flex-col flex-1 min-w-0 overflow-hidden bg-[#0a0a0a]">
          <!-- Center top bar: aspect ratio + generate -->
          <div class="flex items-center justify-between px-6 py-3 border-b border-white/[0.07] shrink-0">
            <!-- Aspect ratio -->
            <div class="flex gap-0.5 bg-white/[0.05] border border-white/[0.08] rounded-xl p-1">
              ${['3:4', '1:1', '9:16', '16:9'].map(
                (r) => html`
                  <button
                    @click=${() => (this.aspectRatio = r)}
                    class="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                      this.aspectRatio === r
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/40'
                        : 'text-gray-500 hover:text-white'
                    }"
                  >
                    ${r}
                  </button>
                `,
              )}
            </div>

            <div class="flex items-center gap-2">
              <!-- Shuffle -->
              <button
                @click=${this.handleShuffle}
                class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/10 text-[12px] font-semibold transition-all"
              >
                ${ShuffleIcon}
                Shuffle
              </button>

              <!-- Generate -->
              <button
                @click=${this.handleGenerate}
                ?disabled=${generating}
                class="flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-bold transition-all shadow-lg ${
                  generating
                    ? 'bg-violet-600/40 text-white/60 cursor-not-allowed'
                    : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-600/30 hover:shadow-violet-500/40'
                }"
              >
                ${generating
                  ? html`
                      <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-opacity="0.3" />
                        <path d="M21 12a9 9 0 00-9-9" />
                      </svg>
                      Generating…
                    `
                  : html`
                      ${BoltIcon}
                      Generate Character
                    `}
              </button>
            </div>
          </div>

          <!-- Preview area -->
          <div class="flex-1 flex items-center justify-center p-6 overflow-hidden">
            <div
              class="relative rounded-2xl overflow-hidden bg-[#141414] border border-white/[0.07] shadow-2xl flex items-center justify-center"
              style="aspect-ratio: ${arMap[this.aspectRatio] ?? '3/4'}; max-height: 100%; max-width: 100%"
            >
              ${generating
                ? html`
                    <div class="flex flex-col items-center gap-4 text-center px-8 py-12">
                      <div class="w-12 h-12 border-[3px] border-violet-500/20 border-t-violet-500 rounded-full animate-spin"></div>
                      <p class="text-sm text-gray-400 font-medium">Generating your AI influencer…</p>
                    </div>
                  `
                : this.previewUrl
                  ? html`
                      <img src=${this.previewUrl} alt="Generated AI Character" class="w-full h-full object-cover" />
                      <!-- Download overlay button -->
                      <button
                        @click=${() => this.downloadImg(this.previewUrl)}
                        class="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white text-[11px] font-semibold hover:bg-black/80 transition-all"
                      >
                        ${DownloadIcon}
                        Save
                      </button>
                    `
                  : html`
                      <div class="flex flex-col items-center gap-3 text-center px-8 py-12">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8" class="text-gray-700">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                        <p class="text-sm text-gray-600 font-medium">Your AI influencer lives here.</p>
                        <p class="text-xs text-gray-700">Design and build your AI influencer<br />from scratch</p>
                      </div>
                    `}
            </div>
          </div>

          <!-- Selected option pills -->
          ${tags.length > 0
            ? html`
                <div class="px-6 pb-3 shrink-0">
                  <div class="flex flex-wrap gap-1.5 items-center">
                    ${visibleTags.map(
                      (tag) => html`
                        <div
                          class="relative shrink-0"
                          @mouseenter=${() => (this.hoveredTag = tag.subcatId)}
                          @mouseleave=${() => (this.hoveredTag = null)}
                        >
                          ${this.hoveredTag === tag.subcatId && tag.img
                            ? html`
                                <div
                                  class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
                                  style="filter: drop-shadow(0 4px 16px rgba(0,0,0,0.6))"
                                >
                                  <div
                                    class="w-[72px] h-[72px] rounded-xl overflow-hidden border border-white/20 bg-[#1a1a1a]"
                                    style="transform: rotate(-3deg)"
                                  >
                                    <img src=${tag.img} alt=${tag.label} class="w-full h-full object-cover" />
                                  </div>
                                </div>
                              `
                            : nothing}
                          <button
                            type="button"
                            @click=${() => {
                              const ownerTab = Object.keys(TABS_CONFIG).find((tk) =>
                                TABS_CONFIG[tk].subcategories.some((s) => s.id === tag.subcatId),
                              );
                              if (ownerTab) this.activeTab = ownerTab;
                            }}
                            class="h-[22px] px-2 rounded-md bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.10] text-[11px] font-medium text-gray-200 whitespace-nowrap transition-all cursor-pointer"
                          >
                            ${tag.label}
                          </button>
                        </div>
                      `,
                    )}
                    ${tags.length > TAGS_VISIBLE
                      ? html`
                          <button
                            type="button"
                            @click=${() => (this.showAllTags = !this.showAllTags)}
                            class="h-[22px] px-2 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] text-gray-500 hover:text-gray-300 whitespace-nowrap transition-all"
                          >
                            ${this.showAllTags ? 'hide' : 'show more'}
                          </button>
                        `
                      : nothing}
                  </div>
                </div>
              `
            : nothing}

          <!-- Error -->
          ${this.errorMsg
            ? html`
                <div class="mx-6 mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[12px] shrink-0">
                  ${this.errorMsg}
                </div>
              `
            : nothing}

          <!-- Custom prompt bar at bottom -->
          <div class="px-6 pb-4 shrink-0">
            <input
              type="text"
              .value=${this.customPrompt}
              @input=${(e) => (this.customPrompt = e.currentTarget.value)}
              placeholder="Add extra details… e.g. neon cyberpunk lighting, dramatic shadows"
              class="w-full h-9 bg-[#161616] border border-white/[0.07] rounded-xl px-3 text-[12px] text-gray-200 placeholder-gray-600 outline-none focus:border-violet-500/40 transition-colors"
            />
          </div>
        </div>

        <!-- RIGHT — Generated Characters History Gallery -->
        <div class="flex flex-col w-[160px] shrink-0 border-l border-white/[0.07] bg-[#111111] overflow-hidden">
          <!-- Gallery header -->
          <div class="px-3 py-3 border-b border-white/[0.07] shrink-0">
            <p class="text-[11px] font-bold text-white tracking-tight">Generated</p>
            <p class="text-[9px] text-gray-600 mt-0.5">${this.history.length} characters</p>
          </div>

          <!-- Gallery scroll -->
          <div class="flex-1 overflow-y-auto p-2 space-y-2">
            ${this.history.length === 0
              ? html`
                  <div class="flex flex-col items-center justify-center h-32 text-center px-2">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-gray-700 mb-2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                    </svg>
                    <p class="text-[9px] text-gray-700 leading-relaxed">Generated characters<br />appear here</p>
                  </div>
                `
              : this.history.map((item, idx) => html`
                  <div
                    role="button"
                    tabindex="0"
                    @click=${() => (this.selectedHistoryIdx = idx)}
                    @keydown=${(e) => e.key === 'Enter' && (this.selectedHistoryIdx = idx)}
                    class="group relative w-full aspect-[3/4] rounded-xl overflow-hidden border transition-all cursor-pointer ${
                      this.selectedHistoryIdx === idx
                        ? 'border-violet-500 ring-1 ring-violet-500/40'
                        : 'border-white/[0.08] hover:border-white/20'
                    }"
                  >
                    <img src=${item.url} alt="Character ${idx + 1}" class="w-full h-full object-cover" />
                    <!-- Download on hover -->
                    <div class="absolute inset-0 hidden md:flex bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity items-end justify-center pb-2">
                      <div class="absolute right-2 top-2 flex flex-col gap-2">
                        <generation-copy-buttons
                          .prompt=${item.prompt}
                          .imageUrl=${item.url}
                          .onCopyError=${this.onGenerationError}
                        ></generation-copy-buttons>
                      </div>
                      <div
                        role="button"
                        tabindex="0"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.downloadImg(item.url);
                        }}
                        @keydown=${(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            this.downloadImg(item.url);
                          }
                        }}
                        class="p-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-all cursor-pointer"
                      >
                        ${DownloadIcon}
                      </div>
                    </div>
                    <mobile-generation-actions
                      .prompt=${item.prompt}
                      .imageUrl=${item.url}
                      .onCopyError=${this.onGenerationError}
                      .actions=${[
                        {
                          kind: 'download',
                          label: 'Download',
                          onSelect: () => this.downloadImg(item.url),
                        },
                      ]}
                    ></mobile-generation-actions>
                    <!-- Index badge -->
                    <div class="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[8px] text-gray-300 font-bold">
                      #${this.history.length - idx}
                    </div>
                  </div>
                `)}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('studio-influencer', StudioInfluencer);
