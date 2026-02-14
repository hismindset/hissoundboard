export interface Page {
    /** Unique UUID */
    id: string;
    /** User defined name (e.g. "Meme Sounds") */
    name: string;
    /** For sorting in the UI */
    order: number;
    /** The modifier keys required to trigger sounds on this page + Numpad */
    modifierKeys: number[]; // Array of uiohook raw keycodes
}
