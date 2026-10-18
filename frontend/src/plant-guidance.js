const guides = {
  healthy: {
    title: 'No disease pattern reported',
    actions: ['Continue routine scouting and keep watering consistent.', 'If symptoms continue or spread, get the plant checked by a local extension or plant clinic.'],
  },
  hlb: {
    title: 'Citrus greening (HLB) has no known cure',
    actions: ['Treat this AI result as a warning and arrange confirmation through a plant diagnostic service or local plant-health authority.', 'Follow local quarantine and plant-movement rules; ask the authority how confirmed trees and psyllid vectors should be managed.'],
    source: { label: 'USDA APHIS: citrus greening and treatment', href: 'https://direct.aphis.usda.gov/plant-pests-diseases/citrus-diseases/citrus-greening-and-asian-citrus-psyllid' },
  },
  virus: {
    title: 'Plant viruses do not have a cure',
    actions: ['Confirm the diagnosis where possible; virus symptoms can resemble other problems.', 'Remove confirmed infected plants as local guidance recommends, clean hands and tools, and manage the insect vectors for that virus.'],
    source: { label: 'UMN Extension: tomato virus management', href: 'https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/disease-management/tomato-viruses' },
  },
  lateBlight: {
    title: 'Act quickly and confirm late blight',
    actions: ['Separate suspect plants and contact a local extension or plant clinic promptly; late blight can spread quickly.', 'Keep leaves dry, improve airflow, and remove infected plants or crop debris according to local guidance.', 'Use a pesticide only if a local crop guide recommends it and the product label lists this crop and disease.'],
    source: { label: 'UMN Extension: late blight of tomato and potato', href: 'https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/disease-management/late-blight' },
  },
  leafMold: {
    title: 'Reduce humidity around tomato foliage',
    actions: ['Increase ventilation and spacing; use drip irrigation or water at the soil line.', 'Remove badly affected leaves and clear crop residue at season end; clean supports and tools.', 'For future plantings, choose a resistant variety suited to your region.'],
    source: { label: 'UMN Extension: tomato leaf mold', href: 'https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/disease-management/tomato-leaf-mold' },
  },
  bacterialSpot: {
    title: 'Limit spread of bacterial leaf spot',
    actions: ['Avoid handling plants while wet; water at the base and improve spacing and airflow.', 'Remove symptomatic leaves or crop residue with clean tools; rotate away from tomato and pepper as local guidance advises.', 'Confirm the diagnosis before treatment; pesticide options can be limited and resistance occurs.'],
    source: { label: 'UMN Extension: bacterial spot of tomato and pepper', href: 'https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/disease-management/bacterial-spot-of-tomato-and-pepper' },
  },
  peachBacterialSpot: {
    title: 'Manage peach bacterial spot with local orchard guidance',
    actions: ['Confirm the diagnosis; peach scab and copper injury can look similar.', 'Improve canopy airflow with locally recommended pruning and avoid stressing the tree; consider resistant or less-susceptible cultivars when replanting.', 'Management sprays are preventive and timing-sensitive, not a cure for existing lesions. Ask a local fruit extension specialist before applying any product and follow its label.'],
    source: { label: 'Alabama Extension: bacterial spot treatment in peaches', href: 'https://www.aces.edu/blog/topics/crop-production/bacterial-spot-treatment-in-peaches/' },
  },
  powdery: {
    title: 'Manage powdery mildew and protect new growth',
    actions: ['Remove the worst affected leaves, improve airflow, and avoid overcrowding plants.', 'Use resistant varieties when available and avoid excess nitrogen that drives dense growth.', 'If treatment is needed, use only a locally approved product labeled for this crop and mildew.'],
    source: { label: 'Penn State Extension: powdery mildew guidance', href: 'https://extension.psu.edu/powdery-mildew' },
  },
  spiderMite: {
    title: 'Check leaf undersides for spider mites',
    actions: ['Confirm mites or webbing on leaf undersides before treating.', 'Rinse foliage thoroughly and reduce plant stress; avoid broad insecticides that can remove mite predators.', 'If needed, use insecticidal soap or horticultural oil only as its label directs for this crop.'],
    source: { label: 'UMN Extension: managing spider mite on soybean', href: 'https://extension.umn.edu/agriculture/crop-production/soybean/managing-spider-mite-on-soybean' },
  },
  appleScab: {
    title: 'Reduce apple scab carryover',
    actions: ['Remove fallen leaves and fruit after the season to reduce overwintering inoculum.', 'Prune to open the canopy so leaves dry faster, and consider scab-resistant varieties.', 'Ask a local fruit extension service about timing if disease has been severe in past seasons.'],
    source: { label: 'UMN Extension: apple scab management', href: 'https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/yard-and-garden-problems/apple-scab' },
  },
  cedarRust: {
    title: 'Manage both hosts of cedar-apple rust',
    actions: ['Choose resistant apple varieties where available.', 'If practical, remove rust galls from nearby junipers before spring spore release; confirm the host and local recommendations first.'],
    source: { label: 'Penn State Extension: cedar-apple rust', href: 'https://extension.psu.edu/cedar-apple-and-related-rusts-on-ornamentals' },
  },
  grapeBlackRot: {
    title: 'Remove grape black rot inoculum',
    actions: ['Remove mummified grape clusters and infected leaves or shoots; dispose of them away from the vines.', 'Open the canopy to help clusters dry after rain and scout early in the season.', 'Fungicides are preventive and region-specific; follow a local fruit guide and the product label.'],
    source: { label: 'UMN Extension: black rot on grapes', href: 'https://blog-fruit-vegetable-ipm.extension.umn.edu/2026/06/black-rot-on-grapes-guignardia-bidwellii.html' },
  },
  generalLeafDisease: {
    title: 'Limit spread while confirming the disease',
    actions: ['Check several leaves and both sides; similar spots can come from different pathogens.', 'Keep foliage dry where practical, improve airflow, and remove badly affected debris with clean tools.', 'Before using a treatment, confirm the disease and follow crop-specific local extension guidance and the product label.'],
    source: { label: 'UMN Extension: tomato leaf spot management', href: 'https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/yard-and-garden-problems/tomato-leaf-spot-diseases' },
  },
};

export function getPlantGuidance(disease = '', crop = '') {
  const name = disease.toLowerCase();
  if (name.includes('healthy')) return guides.healthy;
  if (name.includes('huanglongbing') || name.includes('citrus greening')) return guides.hlb;
  if (name.includes('virus') || name.includes('mosaic') || name.includes('yellow leaf curl')) return guides.virus;
  if (name.includes('late blight')) return guides.lateBlight;
  if (name.includes('leaf mold')) return guides.leafMold;
  if (name.includes('bacterial spot')) {
    if (/peach/i.test(crop)) return guides.peachBacterialSpot;
    if (/tomato|pepper|capsicum/i.test(crop)) return guides.bacterialSpot;
    return guides.generalLeafDisease;
  }
  if (name.includes('powdery mildew')) return guides.powdery;
  if (name.includes('spider mite')) return guides.spiderMite;
  if (name.includes('apple scab')) return guides.appleScab;
  if (name.includes('cedar-apple rust') || name.includes('cedar apple rust')) return guides.cedarRust;
  if (name.includes('black rot') && /grape/i.test(disease)) return guides.grapeBlackRot;
  if (/blight|spot|rust|rot|scab|leaf scorch|esca|mildew/i.test(name)) return guides.generalLeafDisease;
  return {
    title: 'Confirm the diagnosis before treatment',
    actions: ['Inspect several leaves and nearby plants for the same symptoms.', 'Ask a local extension service or plant clinic to confirm the cause before applying a treatment.'],
  };
}

export function diseaseWeatherCue(disease = '', crop = '', current = {}, daily = {}) {
  const name = disease.toLowerCase();
  const humidity = Number(current.relative_humidity_2m);
  const rainDays = (daily.precipitation_sum || []).map(Number).filter(Number.isFinite);
  const rain5d = rainDays.length ? rainDays.reduce((sum, value) => sum + value, 0) : null;
  const rainChance = (daily.precipitation_probability_max || []).map(Number).filter(Number.isFinite);
  const peakRainChance = rainChance.length ? Math.max(...rainChance) : null;
  const base = { humidity: Number.isFinite(humidity) ? humidity : null, rain5d, peakRainChance };

  if (!disease) return { ...base, title: 'Select a plant result for disease context', summary: 'Compare actual humidity and rainfall for the selected city; a forecast alone cannot rate crop suitability.' };
  if (name.includes('healthy')) return { ...base, title: 'No disease pattern reported', summary: 'Weather here is general growing context. It does not rank countries for a full growing season.' };
  if (/virus|mosaic|yellow leaf curl|huanglongbing|citrus greening/.test(name)) return { ...base, title: 'Humidity and rain cannot rate this disease', summary: 'Follow the disease-specific care steps and confirm the cause; vector pressure and local plant-health guidance matter.' };
  if (name.includes('bacterial spot') && /peach/i.test(crop)) return { ...base, title: 'Check warm, wet weather for peach bacterial spot', summary: 'Frequent rain and high humidity can favor spread, especially in warm weather. Compare city readings as a scouting cue; they cannot confirm infection or rate a full season.' };
  if (name.includes('powdery mildew')) return { ...base, title: 'Mildew needs a disease-specific weather check', summary: 'Powdery mildew can favor warm, relatively dry conditions; rain and humidity percentages alone are not a suitability score.' };
  if (name.includes('spider mite')) return { ...base, title: 'Check for hot, dry mite conditions', summary: 'Hot, dry stretches can favor spider mites. Use this city forecast as a prompt to scout leaf undersides, not as confirmation.' };
  if (name.includes('leaf mold') && humidity != null) {
    return humidity >= 85
      ? { ...base, title: 'High humidity leaf-mold watch', summary: 'Current humidity is at or above the 85% level that favors severe tomato leaf-mold outbreaks; improve ventilation and keep foliage dry.' }
      : { ...base, title: 'Humidity below the leaf-mold severe-risk cue', summary: 'UMN Extension reports severe tomato leaf mold is favored at 85% relative humidity or higher; lower humidity does not rule it out.' };
  }
  return { ...base, title: 'Moisture can matter for this leaf disease', summary: 'Rain and humidity may favor spread for some leaf diseases. Compare the selected city readings and check the crop locally; this is not a diagnosis.' };
}
