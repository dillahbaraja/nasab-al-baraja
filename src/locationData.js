import { Country, State, City } from 'country-state-city';

const allCountries = Country.getAllCountries();
const localeMap = {
  id: 'id-ID',
  en: 'en',
  ar: 'ar'
};
const displayNamesCache = new Map();

const toOption = (item, codeKey, labelKey = 'name') => ({
  code: item?.[codeKey] || '',
  label: item?.[labelKey] || ''
});

const getDisplayNames = (lang = 'en') => {
  const locale = localeMap[lang] || localeMap.en;
  if (!displayNamesCache.has(locale)) {
    displayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
  }
  return displayNamesCache.get(locale);
};

export const getCountryLabelFromCode = (countryCode, lang = 'en', fallback = '') => {
  if (!countryCode) return fallback || '';
  try {
    const localizedName = getDisplayNames(lang).of(countryCode);
    if (localizedName) return localizedName;
  } catch (error) {
    console.warn('Country display-name lookup failed:', error);
  }

  return findCountryByCode(countryCode)?.name || fallback || countryCode;
};

export const getCountryOptions = (lang = 'en') =>
  allCountries.map((country) => ({
    code: country.isoCode,
    label: getCountryLabelFromCode(country.isoCode, lang, country.name)
  }));

export const findCountryByName = (name) =>
  allCountries.find((country) => country.name === name) || null;

export const findCountryByCode = (countryCode) =>
  allCountries.find((country) => country.isoCode === countryCode) || null;

export const getRegionOptions = (countryCode) => {
  if (!countryCode) return [];
  return State.getStatesOfCountry(countryCode).map((state) => toOption(state, 'isoCode'));
};

export const findRegionByName = (countryCode, regionName) => {
  if (!countryCode || !regionName) return null;
  return State.getStatesOfCountry(countryCode).find((state) => state.name === regionName) || null;
};

export const findRegionByCode = (countryCode, regionCode) => {
  if (!countryCode || !regionCode) return null;
  return State.getStatesOfCountry(countryCode).find((state) => state.isoCode === regionCode) || null;
};

export const getCityOptions = (countryCode, regionCode) => {
  if (!countryCode) return [];
  const source = regionCode
    ? City.getCitiesOfState(countryCode, regionCode)
    : City.getCitiesOfCountry(countryCode);
  return source.map((city) => ({ code: city.name, label: city.name }));
};

export const buildLocationState = ({
  country = '',
  countryCode = '',
  region = '',
  regionCode = '',
  city = ''
} = {}, lang = 'en') => {
  const resolvedCountryCode = countryCode || findCountryByName(country)?.isoCode || '';
  const resolvedRegionCode = regionCode || findRegionByName(resolvedCountryCode, region)?.isoCode || '';
  const resolvedRegion = findRegionByCode(resolvedCountryCode, resolvedRegionCode)?.name || region || '';
  const resolvedCountry = resolvedCountryCode
    ? getCountryLabelFromCode(resolvedCountryCode, lang, country)
    : country;

  return {
    country: resolvedCountry || '',
    countryCode: resolvedCountryCode,
    region: resolvedRegion,
    regionCode: resolvedRegionCode,
    city
  };
};

export const ensureCurrentOption = (options, code, label) => {
  if (!code && !label) return options;
  if (options.some((option) => option.code === code || option.label === label)) return options;
  return [{ code: code || `custom:${label}`, label: label || code }, ...options];
};
