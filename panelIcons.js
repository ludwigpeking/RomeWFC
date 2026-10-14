import { PANEL_ICON_PATHS } from './panelIconPaths';

// Keep the same emblem for a subject wherever it appears in either panel.
const ICON_BY_HEADING = {
  'VALUES, RENT AND TAX': 'valueRentTax',
  'VALUE, RENT AND TAX': 'valueRentTax',
  'WHAT RAISES A PROPERTY': 'propertyBonuses',
  'LAND': 'land',
  'HOUSEHOLDS AND THEIR FORTUNES': 'fortunes',
  'TOWERS': 'towers',
  'ARRIVALS AND TRAFFIC': 'traffic',
  'THE CITY: WATER, WALL, WORKS': 'waterWorks',
  'PUBLIC BUILDINGS: HOUSEHOLDS NEEDED': 'publicBuildings',
  'WALL LINE': 'wallLine',
  'CHANGES': 'changes',
  'PEOPLE': 'people',
  'HOLDINGS AND LAND': 'holdings',
  'BUILDINGS': 'buildings',
  'STREETS AND TRAFFIC': 'traffic',
  'LAND USE': 'landUse',
  'THE CITY': 'treasury',
  'OTHER': 'other',
  'THE RICHEST HOUSEHOLDS': 'richestHouseholds',
  'MONUMENTS FOUND IN THE TOWN': 'monuments',
  'CHRONICLE OF THE CITY': 'chronicle',
};

const TOOLBAR_ICON_SELECTORS = {
  traffic: '[data-layer="journeys"] svg',
  holdings: '[data-layer="holding"] svg',
  landUse: '[data-layer="use"] svg',
};

function createPanelIcon(iconName) {
  const toolbarSelector = TOOLBAR_ICON_SELECTORS[iconName];
  if (toolbarSelector) {
    const toolbarIcon = document.querySelector(toolbarSelector);
    return toolbarIcon ? toolbarIcon.cloneNode(true) : null;
  }
  const pathData = PANEL_ICON_PATHS[iconName];
  if (!pathData) {
    return null;
  }
  const vectorNamespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(vectorNamespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'currentColor');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const silhouette = document.createElementNS(vectorNamespace, 'path');
  silhouette.setAttribute('fill-rule', 'evenodd');
  silhouette.setAttribute('d', pathData);
  icon.appendChild(silhouette);
  return icon;
}

function decoratePanelHeading(heading) {
  if (heading.querySelector('.panelHeadingIcon')) {
    return;
  }
  const headingText = heading.textContent.trim();
  const iconName = ICON_BY_HEADING[headingText];
  const icon = createPanelIcon(iconName);
  if (!icon) {
    return;
  }
  const emblem = document.createElement('span');
  emblem.className = 'panelHeadingIcon';
  emblem.setAttribute('aria-hidden', 'true');
  emblem.dataset.icon = iconName;
  emblem.appendChild(icon);
  const label = document.createElement('span');
  label.className = 'panelHeadingLabel';
  label.textContent = headingText;
  heading.classList.add('cardTitleWithIcon');
  heading.replaceChildren(emblem, label);
}

export function createPanelHeading(headingText) {
  const heading = document.createElement('div');
  heading.className = 'cardTitle';
  heading.textContent = headingText;
  decoratePanelHeading(heading);
  return heading;
}

export function decorateExistingPanelHeadings() {
  document.querySelectorAll('#settingsPanel .cardTitle, #statisticsPanel .cardTitle').forEach(decoratePanelHeading);
}
