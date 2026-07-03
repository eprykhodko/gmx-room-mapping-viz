(() => {
  const parseButton = document.getElementById('parseButton');
  const payloadInput = document.getElementById('payloadInput');
  const statusMessage = document.getElementById('statusMessage');
  const errorMessage = document.getElementById('errorMessage');
  const resultsSection = document.getElementById('resultsSection');
  const hotelNameNode = document.getElementById('hotelName');
  const payloadSummary = document.getElementById('payloadSummary');
  const roomsContainer = document.getElementById('roomsContainer');
  const toggleAllRoomsButton = document.getElementById('toggleAllRoomsButton');

  const state = {
    sourceType: '',
    hotel: null,
    roomUi: {}
  };
  const ROOM_DESCRIPTION_PREVIEW_LIMIT = 200;

  parseButton.addEventListener('click', onParseClicked);
  toggleAllRoomsButton.addEventListener('click', onToggleAllRooms);
  roomsContainer.addEventListener('click', onRoomsContainerClick);

  function onParseClicked() {
    clearMessages();
    const rawInput = payloadInput.value;

    try {
      const parsed = autoDetectAndParse(rawInput);
      state.sourceType = parsed.type;
      state.hotel = parsed.hotel;
      resetRoomUiState(parsed.hotel.rooms);
      render();

      const totalRates = state.hotel.rooms.reduce((sum, room) => sum + room.rates.length, 0);
      statusMessage.textContent = `Parsed ${parsed.type.toUpperCase()} payload: ${state.hotel.rooms.length} rooms, ${totalRates} rates.`;
    } catch (error) {
      state.sourceType = '';
      state.hotel = null;
      render();
      errorMessage.textContent = error instanceof Error ? error.message : 'Unable to parse payload.';
    }
  }

  function onToggleAllRooms() {
    if (!state.hotel || state.hotel.rooms.length === 0) {
      return;
    }

    const collapseAll = !areAllRoomsCollapsed();
    state.hotel.rooms.forEach((room) => {
      const ui = getRoomUiState(room.id);
      ui.collapsed = collapseAll;
    });
    render();
  }

  function onRoomsContainerClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !state.hotel) {
      return;
    }

    const action = button.dataset.action;
    const roomId = button.dataset.roomId;
    if (!roomId) {
      return;
    }

    const room = state.hotel.rooms.find((entry) => entry.id === roomId);
    if (!room) {
      return;
    }

    const ui = getRoomUiState(roomId);
    if (action === 'toggle-room') {
      ui.collapsed = !ui.collapsed;
      render();
      return;
    }

    if (action === 'toggle-description') {
      ui.descriptionExpanded = !ui.descriptionExpanded;
      render();
      return;
    }

    if (action === 'toggle-provider') {
      const provider = cleanString(button.dataset.provider);
      if (!provider) {
        return;
      }

      const providers = getRoomProviders(room);
      if (!Array.isArray(ui.activeProviders)) {
        ui.activeProviders = [...providers];
      } else {
        ui.activeProviders = ui.activeProviders.filter((entry) => providers.includes(entry));
      }

      const activeProviderIndex = ui.activeProviders.indexOf(provider);
      if (activeProviderIndex >= 0) {
        ui.activeProviders.splice(activeProviderIndex, 1);
      } else {
        ui.activeProviders.push(provider);
      }
      render();
      return;
    }

    if (action === 'carousel-prev' || action === 'carousel-next') {
      const imageCount = room.images.length;
      if (imageCount === 0) {
        return;
      }
      const direction = action === 'carousel-next' ? 1 : -1;
      ui.carouselIndex = (ui.carouselIndex + direction + imageCount) % imageCount;
      render();
    }
  }


  function render() {
    if (!state.hotel) {
      resultsSection.classList.add('hidden');
      roomsContainer.replaceChildren();
      return;
    }

    resultsSection.classList.remove('hidden');
    hotelNameNode.textContent = state.hotel.hotelName || 'Hotel';

    const totalRates = state.hotel.rooms.reduce((sum, room) => sum + room.rates.length, 0);
    const roomStats = state.hotel.rooms.reduce(
      (stats, room) => {
        const supplierCount = getRoomProviders(room).length;
        if (supplierCount === 1) {
          stats.roomsWithOneSupplier += 1;
        } else if (supplierCount === 2) {
          stats.roomsWithTwoSuppliers += 1;
        }
        if (room.rates.length === 1) {
          stats.roomsWithOneRate += 1;
        }
        return stats;
      },
      { roomsWithOneSupplier: 0, roomsWithTwoSuppliers: 0, roomsWithOneRate: 0 }
    );
    payloadSummary.textContent = `Source: ${state.sourceType.toUpperCase()} • Rooms: ${state.hotel.rooms.length} • Rates: ${totalRates}\nRoom with only one supplier: ${roomStats.roomsWithOneSupplier} • Room with only two suppliers: ${roomStats.roomsWithTwoSuppliers} • Rooms with only one rate: ${roomStats.roomsWithOneRate}`;

    toggleAllRoomsButton.textContent = areAllRoomsCollapsed() ? 'Expand all rates' : 'Collapse all rates';
    roomsContainer.replaceChildren(...state.hotel.rooms.map(buildRoomCard));
  }

  function buildRoomCard(room) {
    const ui = getRoomUiState(room.id);
    const roomCard = createElement('article', 'room-card');

    const roomBody = createElement('div', 'room-body');
    const roomMedia = createElement('div', 'room-media');
    const roomInfo = createElement('div', 'room-info');

    const roomMeta = createElement('div', 'room-meta');
    const roomName = createElement('h3', 'room-name', room.name || 'Room');
    const roomSubtitleParts = [room.roomType, room.bedType].filter(Boolean);
    const roomSubtitle = createElement('p', 'room-sub', roomSubtitleParts.join(' • ') || 'Room details');

    roomInfo.append(roomName, roomSubtitle);
    if (room.roomType) {
      roomMeta.append(createElement('span', 'tag', `Type: ${room.roomType}`));
    }
    if (room.bedType) {
      roomMeta.append(createElement('span', 'tag', `Bed: ${room.bedType}`));
    }
    if (room.accessible) {
      roomMeta.append(createElement('span', 'tag', '♿ Accessible'));
    }
    roomInfo.append(roomMeta);

    roomMedia.append(buildCarousel(room, ui));

    if (room.description) {
      const descriptionNode = buildRoomDescription(room, ui);
      if (descriptionNode) {
        roomInfo.append(descriptionNode);
      }
    }

    if (room.amenities.length > 0) {
      roomInfo.append(createElement('p', 'room-description', `Amenities: ${room.amenities.join(', ')}`));
    }

    const providers = getRoomProviders(room);
    if (!Array.isArray(ui.activeProviders)) {
      ui.activeProviders = [...providers];
    } else {
      ui.activeProviders = ui.activeProviders.filter((provider) => providers.includes(provider));
    }
    const filterRow = createElement('div', 'filter-row');
    filterRow.append(createElement('span', 'filter-label', 'Providers'));

    const providerTags = createElement('div', 'provider-tags');
    if (providers.length === 0) {
      providerTags.append(createElement('span', 'empty', 'No providers'));
    } else {
      providers.forEach((provider) => {
        const isActive = ui.activeProviders.includes(provider);
        const providerTag = createElement('button', `provider-tag ${isActive ? 'is-active' : 'is-inactive'}`, provider);
        providerTag.type = 'button';
        providerTag.dataset.action = 'toggle-provider';
        providerTag.dataset.roomId = room.id;
        providerTag.dataset.provider = provider;
        providerTags.append(providerTag);
      });
    }
    filterRow.append(providerTags);

    const filteredRates = getFilteredRates(room, ui.activeProviders);

    const ratesSection = createElement('section', 'rates-section rates-section-full');
    const ratesHeader = createElement('div', 'rates-header');
    const ratesTitle = createElement('h4', 'rates-title', `Rates (${filteredRates.length}/${room.rates.length})`);
    const toggleRatesButton = createElement('button', 'secondary-button', ui.collapsed ? 'Expand rates' : 'Collapse rates');
    toggleRatesButton.type = 'button';
    toggleRatesButton.dataset.action = 'toggle-room';
    toggleRatesButton.dataset.roomId = room.id;

    ratesHeader.append(ratesTitle, toggleRatesButton);
    ratesSection.append(ratesHeader, filterRow);

    if (ui.collapsed) {
      ratesSection.append(createElement('p', 'empty', 'Rates are collapsed.'));
    } else if (filteredRates.length === 0) {
      ratesSection.append(createElement('p', 'empty', 'No rates for selected provider.'));
    } else {
      const rateList = createElement('div', 'rate-list');
      filteredRates.forEach((rate) => rateList.append(buildRateCard(rate)));
      ratesSection.append(rateList);
    }

    roomBody.append(roomMedia, roomInfo, ratesSection);
    roomCard.append(roomBody);
    return roomCard;
  }

  function buildRoomDescription(room, ui) {
    const sanitizedDescription = sanitizeHtml(room.description);
    if (!sanitizedDescription) {
      return null;
    }

    const descriptionText = htmlToPlainText(sanitizedDescription);
    const canCollapse = descriptionText.length > ROOM_DESCRIPTION_PREVIEW_LIMIT;
    const isExpanded = ui.descriptionExpanded || !canCollapse;

    const descriptionNode = createElement('div', 'room-description');
    if (isExpanded) {
      const descriptionContent = createElement('div', 'room-description-content');
      descriptionContent.innerHTML = sanitizedDescription;
      descriptionNode.append(descriptionContent);
    } else {
      const previewText = `${descriptionText.slice(0, ROOM_DESCRIPTION_PREVIEW_LIMIT).trimEnd()}...`;
      descriptionNode.append(createElement('p', 'room-description-preview', previewText));
    }

    if (canCollapse) {
      const toggleDescriptionButton = createElement(
        'button',
        'link-button room-description-toggle',
        isExpanded ? 'show less' : 'show more...'
      );
      toggleDescriptionButton.type = 'button';
      toggleDescriptionButton.dataset.action = 'toggle-description';
      toggleDescriptionButton.dataset.roomId = room.id;
      descriptionNode.append(toggleDescriptionButton);
    }

    return descriptionNode;
  }

  function buildCarousel(room, ui) {
    const carousel = createElement('div', 'carousel');

    if (room.images.length === 0) {
      carousel.append(createElement('div', 'carousel-placeholder', 'No images available'));
      return carousel;
    }

    const clampedIndex = Math.max(0, Math.min(ui.carouselIndex, room.images.length - 1));
    ui.carouselIndex = clampedIndex;
    const currentImage = room.images[clampedIndex];

    const image = createElement('img');
    image.src = currentImage.url;
    image.alt = currentImage.description || `${room.name || 'Room'} image ${clampedIndex + 1}`;
    carousel.append(image);

    const controls = createElement('div', 'carousel-controls');
    const prevButton = createElement('button', 'secondary-button', 'Prev');
    prevButton.type = 'button';
    prevButton.dataset.action = 'carousel-prev';
    prevButton.dataset.roomId = room.id;
    prevButton.disabled = room.images.length <= 1;

    const counter = createElement('span', null, `${clampedIndex + 1} / ${room.images.length}`);

    const nextButton = createElement('button', 'secondary-button', 'Next');
    nextButton.type = 'button';
    nextButton.dataset.action = 'carousel-next';
    nextButton.dataset.roomId = room.id;
    nextButton.disabled = room.images.length <= 1;

    controls.append(prevButton, counter, nextButton);
    carousel.append(controls);

    return carousel;
  }

  function buildRateCard(rate) {
    const rateCard = createElement('article', 'rate-card');

    const topRow = createElement('div', 'rate-top');
    topRow.append(
      createElement('span', 'rate-price', formatPrice(rate.currency, rate.priceValue)),
      createElement('span', 'rate-provider', `Provider: ${rate.provider || 'Unknown'}`)
    );
    rateCard.append(topRow);

    if (rate.name) {
      rateCard.append(createElement('h5', 'rate-name', rate.name));
    }

    if (rate.description && rate.description !== rate.name) {
      rateCard.append(createElement('p', 'rate-description', rate.description));
    }

    if (rate.roomExtras.length > 0) {
      rateCard.append(createElement('div', 'rate-extra', `Room extras: ${rate.roomExtras.join(', ')}`));
    }

    if (rate.mealPlan) {
      rateCard.append(createElement('div', 'rate-extra', `Meal plan: ${rate.mealPlan}`));
    }

    return rateCard;
  }

  function autoDetectAndParse(rawInput) {
    const input = String(rawInput || '').trim();
    if (!input) {
      throw new Error('Input is empty. Paste XML or JSON payload first.');
    }

    const parseAttempts = input.startsWith('<') ? ['xml', 'json'] : ['json', 'xml'];
    const errors = [];

    for (const candidate of parseAttempts) {
      try {
        if (candidate === 'xml') {
          return { type: 'xml', hotel: parseXmlPayload(input) };
        }
        return { type: 'json', hotel: parseJsonPayload(input) };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parse error';
        errors.push(`${candidate.toUpperCase()}: ${message}`);
      }
    }

    throw new Error(`Unable to parse payload. ${errors.join(' | ')}`);
  }

  function parseXmlPayload(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid XML.');
    }

    const hotelInfoNode = firstDescendantByLocalName(xmlDoc, 'HotelInfo');
    const hotelName = cleanString(hotelInfoNode ? hotelInfoNode.getAttribute('HotelName') : '') || 'Hotel';
    const roomNodes = descendantsByLocalName(xmlDoc, 'Room');

    if (roomNodes.length === 0) {
      throw new Error('XML payload does not contain any Room nodes.');
    }

    const usedRoomIds = new Set();
    const rooms = roomNodes.map((roomNode, roomIndex) => {
      const roomDescriptionNode = firstDescendantByLocalName(roomNode, 'RoomDescription');
      const bedTypeNode = firstDescendantByLocalName(roomNode, 'BedType');
      const roomIdRaw = cleanString(roomNode.getAttribute('RoomID'));
      const roomId = makeUniqueId(roomIdRaw || `xml-room-${roomIndex + 1}`, usedRoomIds);
      const roomType = cleanString(roomNode.getAttribute('RoomType'));
      const accessible = parseBooleanFlag(roomNode.getAttribute('AccessibleRoom'), false);

      let bedType = cleanString(bedTypeNode ? bedTypeNode.getAttribute('Description') : '');
      if (!bedType && bedTypeNode) {
        const descriptionNode = firstDescendantByLocalName(bedTypeNode, 'Description');
        bedType = cleanString(descriptionNode ? descriptionNode.textContent : '');
      }

      const roomName = cleanString(roomDescriptionNode ? roomDescriptionNode.getAttribute('Name') : '') || `Room ${roomIndex + 1}`;
      const roomDescription = extractNestedText(roomDescriptionNode);

      const ratePlansNode = firstDescendantByLocalName(roomNode, 'RatePlans');
      const ratePlanNodes = ratePlansNode ? descendantsByLocalName(ratePlansNode, 'RatePlan') : [];
      const rates = ratePlanNodes.map((ratePlanNode, rateIndex) => {
        const convertedRateNode = firstDescendantByLocalName(ratePlanNode, 'ConvertedRateInfo');
        const ratePlanDescriptionNode = firstDescendantByLocalName(ratePlanNode, 'RatePlanDescription');
        const mealPlanNode = firstDescendantByLocalName(ratePlanNode, 'MealsIncluded');
        const roomExtraNodes = descendantsByLocalName(ratePlanNode, 'RoomExtra');

        const roomExtras = dedupeStrings(
          roomExtraNodes
            .map((roomExtraNode) => cleanString(roomExtraNode.getAttribute('Description')))
            .filter(Boolean)
        );

        return {
          id: `${roomId}-rate-${rateIndex + 1}`,
          name: cleanString(ratePlanNode.getAttribute('RatePlanName')),
          description: extractNestedText(ratePlanDescriptionNode),
          provider: 'Sabre',
          priceValue: parseNumber(convertedRateNode ? convertedRateNode.getAttribute('AverageNightlyRateBeforeTax') : null),
          currency: cleanString(convertedRateNode ? convertedRateNode.getAttribute('CurrencyCode') : '') || 'USD',
          roomExtras,
          mealPlan: cleanString(mealPlanNode ? mealPlanNode.getAttribute('MealPlanDescription') : '')
        };
      });

      rates.sort(compareRatesByPrice);

      return {
        id: roomId,
        name: roomName,
        description: roomDescription,
        roomType,
        bedType,
        accessible,
        amenities: [],
        images: [],
        rates
      };
    });

    return { hotelName, rooms };
  }

  function parseJsonPayload(jsonText) {
    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      throw new Error('Invalid JSON.');
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Top-level JSON payload must be an object.');
    }

    if (!Array.isArray(payload.rooms)) {
      throw new Error('JSON payload is missing rooms array.');
    }

    if (!Array.isArray(payload.rates)) {
      throw new Error('JSON payload is missing rates array.');
    }

    const hotelName = cleanString(payload.hotel_name || payload.hotelName) || 'Hotel';
    const usedRoomIds = new Set();
    const sourceRoomIdToUiId = new Map();
    const rooms = payload.rooms.map((room, roomIndex) => {
      const sourceRoomId = cleanString(room && (room.room_id || room.id || room.roomId));
      const uiRoomId = makeUniqueId(sourceRoomId || `json-room-${roomIndex + 1}`, usedRoomIds);
      if (sourceRoomId && !sourceRoomIdToUiId.has(sourceRoomId)) {
        sourceRoomIdToUiId.set(sourceRoomId, uiRoomId);
      }

      const imageValues = Array.isArray(room && room.room_images) ? room.room_images : [];
      const images = imageValues
        .map((image) => {
          if (typeof image === 'string') {
            return { url: cleanString(image), description: '' };
          }
          if (image && typeof image === 'object') {
            return {
              url: cleanString(image.url),
              description: cleanString(image.description)
            };
          }
          return null;
        })
        .filter((image) => image && image.url);

      const amenitiesRaw = Array.isArray(room && room.room_amenities)
        ? room.room_amenities
        : Array.isArray(room && room.amenities)
          ? room.amenities
          : [];

      const amenities = amenitiesRaw
        .map((amenity) => cleanString(String(amenity)))
        .filter(Boolean);

      return {
        id: uiRoomId,
        sourceRoomId,
        name: cleanString(room && (room.room_name || room.name)) || `Room ${roomIndex + 1}`,
        description: cleanString(room && (room.room_description || room.description)),
        roomType: '',
        bedType: '',
        accessible: false,
        amenities,
        images,
        rates: []
      };
    });

    const roomById = new Map(rooms.map((room) => [room.id, room]));

    payload.rates.forEach((rate, rateIndex) => {
      const sourceRoomId = cleanString(rate && (rate.room_id || rate.roomId || rate.room));
      if (!sourceRoomId) {
        return;
      }

      const targetRoomId = sourceRoomIdToUiId.get(sourceRoomId);
      if (!targetRoomId) {
        return;
      }

      const room = roomById.get(targetRoomId);
      if (!room) {
        return;
      }

      const priceValue = firstFiniteNumber([
        rate.average,
        rate.average_before_taxes_usd,
        rate.average_after_taxes_usd,
        rate.local_average,
        rate.total
      ]);

      room.rates.push({
        id: `${targetRoomId}-rate-${rateIndex + 1}`,
        name: cleanString(rate.rate_code),
        description: cleanString(rate.rate_description || rate.description),
        provider: cleanString(rate.provider) || 'Unknown',
        priceValue,
        currency: cleanString(rate.currency || rate.local_currency) || 'USD',
        roomExtras: [],
        mealPlan: ''
      });
    });

    rooms.forEach((room) => room.rates.sort(compareRatesByPrice));
    return { hotelName, rooms };
  }

  function createElement(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) {
      node.className = className;
    }
    if (typeof text === 'string') {
      node.textContent = text;
    }
    return node;
  }


  function sanitizeHtml(rawHtml) {
    const template = document.createElement('template');
    template.innerHTML = String(rawHtml || '');

    const blockedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM']);
    const elements = template.content.querySelectorAll('*');
    elements.forEach((element) => {
      if (blockedTags.has(element.tagName)) {
        element.remove();
        return;
      }

      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();

        if (name.startsWith('on') || name === 'srcdoc' || name === 'style') {
          element.removeAttribute(attribute.name);
          return;
        }

        if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
          element.removeAttribute(attribute.name);
        }
      });
    });

    return template.innerHTML.trim();
  }

  function htmlToPlainText(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    return cleanString(template.content.textContent || '');
  }

  function descendantsByLocalName(root, localName) {
    if (!root || !localName) {
      return [];
    }
    const nodes = root.getElementsByTagName('*');
    const results = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.localName === localName) {
        results.push(node);
      }
    }
    return results;
  }

  function firstDescendantByLocalName(root, localName) {
    const matches = descendantsByLocalName(root, localName);
    return matches.length > 0 ? matches[0] : null;
  }

  function extractNestedText(node) {
    if (!node) {
      return '';
    }
    const nestedTextNode = firstDescendantByLocalName(node, 'Text');
    if (nestedTextNode && cleanString(nestedTextNode.textContent)) {
      return cleanString(nestedTextNode.textContent);
    }
    return cleanString(node.textContent);
  }

  function cleanString(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function parseNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function firstFiniteNumber(values) {
    for (let index = 0; index < values.length; index += 1) {
      const parsed = parseNumber(values[index]);
      if (parsed !== null) {
        return parsed;
      }
    }
    return null;
  }

  function compareRatesByPrice(left, right) {
    if (left.priceValue === null && right.priceValue === null) {
      return 0;
    }
    if (left.priceValue === null) {
      return 1;
    }
    if (right.priceValue === null) {
      return -1;
    }
    return left.priceValue - right.priceValue;
  }

  function formatPrice(currency, priceValue) {
    const normalizedCurrency = cleanString(currency) || 'USD';
    if (priceValue === null) {
      return `${normalizedCurrency} --`;
    }
    return `${normalizedCurrency} ${priceValue.toFixed(2)}`;
  }

  function parseBooleanFlag(rawValue, defaultValue) {
    const normalized = cleanString(rawValue).toLowerCase();
    if (!normalized) {
      return defaultValue;
    }
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
  }

  function dedupeStrings(values) {
    const seen = new Set();
    const result = [];
    values.forEach((value) => {
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    });
    return result;
  }

  function makeUniqueId(baseId, usedIds) {
    const normalizedBase = cleanString(baseId) || 'item';
    let candidate = normalizedBase;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${normalizedBase}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
  }

  function getRoomUiState(roomId) {
    if (!state.roomUi[roomId]) {
      state.roomUi[roomId] = {
        collapsed: false,
        activeProviders: null,
        carouselIndex: 0,
        descriptionExpanded: false
      };
    }
    return state.roomUi[roomId];
  }

  function resetRoomUiState(rooms) {
    const nextState = {};
    rooms.forEach((room) => {
      nextState[room.id] = {
        collapsed: false,
        activeProviders: null,
        carouselIndex: 0,
        descriptionExpanded: false
      };
    });
    state.roomUi = nextState;
  }

  function areAllRoomsCollapsed() {
    if (!state.hotel || state.hotel.rooms.length === 0) {
      return false;
    }
    return state.hotel.rooms.every((room) => getRoomUiState(room.id).collapsed);
  }

  function getRoomProviders(room) {
    const providers = room.rates
      .map((rate) => cleanString(rate.provider))
      .filter(Boolean);
    return dedupeStrings(providers).sort((left, right) => left.localeCompare(right));
  }

  function getFilteredRates(room, activeProviders) {
    if (!Array.isArray(activeProviders) || activeProviders.length === 0) {
      return [];
    }

    const activeProviderSet = new Set(activeProviders);
    return room.rates.filter((rate) => activeProviderSet.has(rate.provider));
  }

  function clearMessages() {
    statusMessage.textContent = '';
    errorMessage.textContent = '';
  }
})();
