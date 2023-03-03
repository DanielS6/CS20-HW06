document.addEventListener( 'DOMContentLoaded', function () {

    /**
     * Create a new element (using docInstance) for the given tag with the
     * specified content. If it is a string, it is set as the *text content*,
     * otherwise it should be an array, and each element is appended.
     *
     * @param {Document} docInstance 
     * @param {string} tagName 
     * @param {string|Element[]} contents 
     * @param {Object<string,string>|undefined} attrs map of attributes to add
     * @return {Element}
     */
    const makeElement = (docInstance, tagName, contents, attrs) => {
        const elem = docInstance.createElement(tagName);
        if (typeof contents === 'string') {
            elem.textContent = contents;
        } else {
            elem.append(...contents);
        }
        Object.keys(attrs || {}).forEach((k) => elem.setAttribute(k, attrs[k]));
        return elem;
    };

    // Convert cost to string with 2 digits after the decimal point
    const formatCost = (cost) => cost.toFixed(2).toString();

    /**
     * Format the time `delayMinutes` from now as 'WWW MMM DD YYYY at HH:MM'
     * @param {number} delayMinutes either 15 or 45
     * @return {string}
     */
    const formatDate = (delayMinutes) => {
        // Date.setMinutes() will update the other fields if minutes becomes
        // more than 60, so no special handling is needed
        const date = new Date();
        date.setMinutes( date.getMinutes() + delayMinutes );

        return date.toDateString() + ' at '
                + date.toTimeString().substring(0, 5);
    };

    /**
     * All costs (per item, subtotal, tax, and total) start at $0.00 and need
     * to be read-only (and should also be skipped when tabbing)
     * @param {Element} elem 
     */
    const initializeCostField = (elem) => {
        elem.value = '0.00';
        elem.setAttribute('readonly', true);
        elem.setAttribute('tabindex', -1);
    };

    /**
     * "Class" based on object prototypes so that this works in older browsers
     *
     * @param {HTMLTableRowElement} tableRow for a menu option, should have
     *   4 child <td> elements holding the <select> with the quantity, the item
     *   name, the unit cost, and an <input> for the total cost, respectively
     */
    function MenuOption(tableRow) {
        const quantitySelector = tableRow.children[0].children[0];
        quantitySelector.addEventListener('input', this.onUpdate.bind(this));

        this.optionName = tableRow.children[1].textContent;

        this.costStr = tableRow.children[2].textContent;
        this.unitCost = parseFloat(this.costStr.substring(1));

        this.totalCostElem = tableRow.children[3].children[0];
        initializeCostField(this.totalCostElem);
        this.totalCostRaw = 0.00;
        this.quantity = 0;

        // when we make updates, we have the overall <tr> emit an event, need to
        // save it
        this.tableRow = tableRow;
    }
    /**
     * Handle changing the quantity chosen
     * @param {Event} event From the quantity selector, when the value changes
     */
    MenuOption.prototype.onUpdate = function( event ) {
        this.quantity = event.target.value;
        this.totalCostRaw = this.quantity * this.unitCost;
        this.totalCostElem.value = formatCost(this.totalCostRaw);
        const updateEvent = new Event('update');
        this.tableRow.dispatchEvent(updateEvent);
    };
    /** @return {number} float for the total cost */
    MenuOption.prototype.getTotalCost = function () {
        return this.totalCostRaw;
    };
    /**
     * Create a <tr> for this menu option to be shown on the confirmation page
     * @param {Document} doc 
     * @return {HTMLTableRowElement}
     */
    MenuOption.prototype.makeConfirmationRow = function (doc) {
        return makeElement(
            doc, 'tr',
            [
                makeElement(doc, 'td', this.quantity.toString()),
                makeElement(doc, 'td', this.optionName),
                makeElement(doc, 'td', this.costStr),
                makeElement(doc, 'td', '$' + this.totalCostElem.value)
            ]
        );
    };

    // first <tr> is the headings, skip it
    const menuRowsNodeList = document.querySelectorAll('tr:not(:first-child)');
    const menuRows = Array.from(menuRowsNodeList);
    const menuOptions = menuRows.map(tr => new MenuOption(tr));

    const subtotal = document.getElementById('subtotal');
    const tax = document.getElementById('tax');
    const total = document.getElementById('total');
    [ subtotal, tax, total ].forEach(e => initializeCostField(e));

    const onOrderChange = () => {
        // Yes, we could try to keep track of how much came from each dish and
        // only make the needed change, but that is much more complicated than
        // just fetching all of the total costs now
        const subtotalPrice = menuOptions.reduce(
            (total, currOption) => total + currOption.getTotalCost(),
            0.00
        );
        subtotal.value = formatCost(subtotalPrice);
        const taxAmount = subtotalPrice * 0.0625;
        tax.value = formatCost(taxAmount);
        total.value = formatCost(subtotalPrice + taxAmount);
    };
    menuRows.forEach(e => e.addEventListener('update', onOrderChange));

    const [pickup, delivery] = document.querySelectorAll('input[name="p_or_d"]');
    // yes, we know it currently defaults to pickup, but that might change
    let isPickup = pickup.checked;
    // Street and City are required for delivery, hidden for pickup
    // should show/hide the entire line, not just the input
    const [street, city] = document.querySelectorAll('.address');
    const onTypeChange = (wantPickup) => {
        isPickup = wantPickup;
        // hidden if choosing pickup, show if choosing delivery
        street.classList.toggle('hidden', wantPickup);
        city.classList.toggle('hidden', wantPickup);
    };
    pickup.addEventListener('input', () => onTypeChange(true));
    delivery.addEventListener('input', () => onTypeChange(false));
    // make things hidden if needed based on starting value
    onTypeChange(isPickup);

    const phoneField = document.querySelector('input[name="phone"]');
    const streetField = document.querySelector('input[name="street"]');
    const cityField = document.querySelector('input[name="city"]');
    const firstNameField = document.querySelector('input[name="fname"]');
    const lastNameField = document.querySelector('input[name="lname"]');
    /**
     * @return {string|false} full name for customer, or false if last name
     *   is missing, only the last name is required
     */
    const getCustomerName = () => {
        if (lastNameField.value === '') {
            return false;
        }
        let firstName = firstNameField.value;
        if (firstName != '') {
            // Space between names only if first name is included
            firstName += ' ';
        }
        return (firstName + lastNameField.value);
    }
    /** @return {string} containing the digits in the phone field */
    const extractPhoneNumber = () => {
        const isDigit = (c) => c >= '0' && c <= '9';
        return phoneField.value.split('').filter(isDigit).join('');
    };
    const validators = [
        // at least one item must be ordered
        // shortcut - just use the total price, will be 0 iff no items ordered
        () => (total.value !== '0.00' ? true : 'No items ordered!'),
        () => {
            // need any 7 or 10 digits, other characters don't matter
            const numDigits = extractPhoneNumber().length;
            return ((numDigits === 7 || numDigits === 10)
                        ? true
                        : 'Phone numbers must have 7 or 10 digits!');
        },
        () => {
            if (isPickup) {
                return true;
            }
            return ((streetField.value !== '' && cityField.value !== '')
                    ? true
                    : 'Delivery requires a street and city!');
        },
        () => ((getCustomerName() !== false)
                    ? true
                    : 'Last name is required!'
        )
    ];
    const doValidate = () => {
        const errors = validators.map(v => v()).filter(r => r !== true);
        if (errors.length === 0) {
            return true;
        }
        if (errors.length === 1) {
            alert('Error: ' + errors[0]);
            return false;
        }
        alert('Errors:\n - ' + errors.join('\n - '));
        return false;
    };

    /**
     * Get <title> and <link> for styles for confirmation page
     * @param {Document} doc 
     * @returns {Element[]} elements to add to <head>
     */
    const getConfirmationHeadItems = (doc) => {
        const title = makeElement(
            doc, 'title', 'Jade Delight - Order Confirmation'
        );
        // while for the order page we can use ./styles.css and that works
        // fine, because the newly created window isn't in the same directory
        // (it has no URL) need to use an absolute href, determined by
        // fetching it from the styles on the current page
        const currStyles = document.querySelector('link');
        const styleLink = makeElement(
            doc, 'link', [],
            { 'rel': 'stylesheet', 'type': 'text/css', 'href': currStyles.href }
        );
        return [title, styleLink];
    };
    /**
     * @param {Document} doc 
     * @return {HTMLDivElement} with customer details (name, phone number,
     *   order type)
     */
    const getCustomerDetails = (doc) => {
        let orderType = 'pickup';
        if (!isPickup) {
            orderType = 'delivery to ' + streetField.value + ', '
                            + cityField.value;
        }
        return makeElement(
            doc, 'div',
            [
                makeElement(doc, 'strong', 'Customer:'),
                makeElement(doc, 'p', 'Name: ' + getCustomerName()),
                makeElement(doc, 'p', 'Phone number: ' + extractPhoneNumber()),
                makeElement(doc, 'p', 'Order type: ' + orderType)
            ],
            { 'id': 'customer-details' }
        );
    };
    /**
     * @param {Document} doc 
     * @return {HTMLDivElement} with order details (items ordered, costs,
     *   subtotal, tax, and total cost)
     */
    const getConfirmationOrderDetails = (doc) => {
        // <thead> has <tr> with <th> labels
        const headerRow = makeElement(
            doc, 'tr',
            ['Quantity', 'Item', 'Unit cost', 'Total cost']
                .map((text) => makeElement(doc, 'th', text))
        );
        const thead = makeElement(doc, 'thead', [headerRow]);

        // <tbody> with individual menu items, and a summary
        const menuRows = menuOptions.map(mo => mo.makeConfirmationRow(doc));
        const tbody = makeElement(doc, 'tbody', menuRows);
        // rows for subtotal, tax, and overall total
        const makeSummary = (label, value, attrs) => makeElement(
            doc, 'tr',
            [
                makeElement(doc, 'td', label, { 'colspan': '3' }),
                makeElement(doc, 'td', '$' + value)
            ],
            attrs
        );
        tbody.append(
            makeSummary('Subtotal', subtotal.value, { 'id': 'subtotal-row' }),
            makeSummary('Massachusetts tax (6.25%)', tax.value),
            makeSummary('Total', total.value)
        );
        return makeElement(
            doc, 'div',
            [
                makeElement(doc, 'strong', 'Order:'),
                makeElement(doc, 'table', [thead, tbody])
            ],
            { 'id': 'order-details' }
        );
    };
    /**
     * @param {Document} doc 
     * @return {HTMLDivElement} with timeline details (when the order will be
     *   done, and either ready for pickup or delivered)
     */
    const getOrderTimeline = (doc) => {
        const delayMinutes = (isPickup ? 15 : 45);
        const action = isPickup ? 'ready for pickup' : 'delivered';
        const timeline = 'Your order will be ' + action + ' in the next '
            + delayMinutes.toString() + ' minutes, by '
            + formatDate(delayMinutes) + '.';

        return makeElement(
            doc, 'div',
            [
                makeElement(doc, 'strong', 'Timeline:'),
                makeElement(doc, 'p', timeline)
            ],
            { 'id': 'timeline-details' }
        );
    };
    /**
     * @param {Document} doc 
     * @return {HTMLElement} elements to add to <body>
     */
    const getConfirmationBodyItems = (doc) => {
        const heading = makeElement(
            doc, 'h1', 'Jade Delight Order Confirmation'
        );
        const bodyWrapper = makeElement(
            doc, 'div',
            [
                getCustomerDetails(doc),
                getConfirmationOrderDetails(doc),
                getOrderTimeline(doc)
            ],
            { 'id': 'body-content' }
        );
        return [heading, bodyWrapper];
    };

    const getSubmissionPopup = () => {
        const popupLabel = makeElement(
            document, 'strong', 'Order submitted!',
            { 'id': 'submission-popup-label' }
        );
        const popupText = makeElement(
            document, 'span', 'Press continue to view the confirmation.',
            { 'id': 'submission-popup-text'}
        );
        const popupContinue = makeElement(
            document, 'button', 'Continue', { 'id': 'submission-popup-continue'}
        );
        const popupContinueWrapper = makeElement(
            document, 'div', [popupContinue],
            { 'id': 'submission-popup-continue-wrapper'}
        );
        const hr = makeElement(document, 'hr', '');
        const popupDialog = makeElement(
            document, 'div',
            [ popupLabel, popupText, hr, popupContinueWrapper],
            { 'id': 'submission-popup-dialog' }
        );
        const popupWrapper = makeElement(
            document, 'div', [popupDialog], { 'id': 'submission-popup-wrapper' }
        );
        // When the button gets clicked, make overall wrapper emit `continue`
        popupContinue.addEventListener('click', () => {
            const continueEvent = new Event('continue');
            popupWrapper.dispatchEvent(continueEvent);
        });
        return popupWrapper;
    }
    /**
     * Launch new window with order confirmation
     */
    const launchConfirmationPage = () => {
        const windowRef = window.open('');
        const otherDoc = windowRef.document;
        const otherDocHead = otherDoc.querySelector('head');
        otherDocHead.append(...getConfirmationHeadItems(otherDoc));
        const otherDocBody = otherDoc.querySelector('body');
        otherDocBody.classList.add('confirmation-page');
        otherDocBody.append(...getConfirmationBodyItems(otherDoc));
    };

    /**
     * Upon successful submission, show a popup message. Once that is closed,
     * a new window opens with the details.
     */
    const onSubmitSuccess = () => {
        const popup = getSubmissionPopup();
        document.querySelector('body').append(popup);
        popup.addEventListener( 'continue', () => {
            popup.remove();
            launchConfirmationPage();
        } )
    };

    /**
     * We have our own confirmation page opened in a new tab, the form doesn't
     * actually get submitted anywhere, so need to prevent normal submission.
     * Because this handler is done as an event listener rather than with
     * form.onsubmit, returning false from this function does not prevent
     * submission, need to do `e.preventDefault()`.
     * 
     * @param {Event} e 
     */
    const onFormSubmission = (e) => {
        e.preventDefault();
        if (doValidate()) {
            onSubmitSuccess();
        }
    };
    // Handle submission
    const form = document.querySelector('form');
    form.addEventListener('submit', onFormSubmission);

    // The button labeled submit has `type="button"` not `type="submit"` so
    // it doesn't actually trigger the submission, need to manually connect
    const submitBtn = document.querySelector(
        'input[type="button"][value="Submit Order"]'
    );
    // use `requestSubmit()` because `submit()` doesn't check validation
    submitBtn.addEventListener('click', () => form.requestSubmit());
} );