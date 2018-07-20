const desktopIdle = require('desktop-idle');
const EventEmitter = require('events');

const STATUS_AWAY = 'away';
const STATUS_ONLINE = 'online';

/**
 * NodeAFK
 *
 * @extends EventEmitter
 */
class NodeAFK extends EventEmitter {
  /**
   * Create a new instance of NodeAFK
   * @param {number} inactivityDuration The duration until the user is considered `away` (in ms)
   * @param {number} pollInterval How often should NodeAFK poll the system to
   * get the current idle time (in ms)
   * @param {string} initialStatus The initial status of the user
   */
  constructor(
    inactivityDuration,
    pollInterval = 1000,
    initialStatus = STATUS_ONLINE,
  ) {
    super();

    this.inactivityDuration = inactivityDuration;
    this.pollInterval = pollInterval;
    this.pollIntervalId = undefined;
    this.timedEvents = [];
    this.userLastCameOnlineAt = undefined;

    this.setStatus(initialStatus);
  }

  /**
   * Set the current status for the user
   * @param {string} status The new status for the user
   * @throws Will throw an error when an invalid status is provided
   * @public
   */
  setStatus(status) {
    if (![STATUS_AWAY, STATUS_ONLINE].includes(status)) {
      throw new Error(`${status} is not a valid status`);
    }

    this.userLastCameOnlineAt = (status === STATUS_ONLINE) ? Date.now() : undefined;
    this.currentStatus = status;
  }

  /**
   * Initialise the NodeAFK instance:
   *  - Cleans up any existing poll intervals, timed events and event listeners
   *  - Sets up the poll interval
   * @public
   */
  init() {
    this.destroy();

    this.pollIntervalId = setInterval(
      this.pollStatus.bind(this),
      this.pollInterval,
    );
  }

  /**
   * Destroy the NodeAFK instance:
   *  - Stops the poll interval if it has been setup
   *  - Clears any timed events
   *  - Unregisters any registered event listeners
   * @public
   */
  destroy() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
    }

    this.timedEvents = [];

    this.removeAllListeners();
  }

  /**
   * Register an event listener on an event
   * @param {string} eventName Name of the event to register the listener to
   * @param {function} listener Function to be executed when the event is emitted
   * @public
   */
  on(eventName, listener) {
    const eventNameInfo = this.parseEventName(eventName);

    if (eventNameInfo.isTimedEvent) {
      this.timedEvents.push({
        status: eventNameInfo.status,
        duration: eventNameInfo.duration,
        listener,
      });
    }

    super.on(eventName, listener);
  }

  /**
   * Unregister an event listener that is registered on an event
   * @param {string} eventName Name of the event to unregister the listener from
   * @param {function} listener Listener to be unregistered
   * @public
   */
  off(eventName, listener) {
    const eventNameInfo = this.parseEventName(eventName);

    if (eventNameInfo.isTimedEvent) {
      this.timedEvents = this.timedEvents.filter(
        timedEvent => timedEvent.status === eventNameInfo.status
          && timedEvent.duration === eventNameInfo.duration
          && timedEvent.listener === listener,
      );
    }

    super.off(eventName, listener);
  }

  /**
   * Poll the system to get the idle time for the user and emit any events required
   * @private
   */
  pollStatus() {
    const idleTime = desktopIdle.getIdleTime();

    if (this.currentStatus === STATUS_ONLINE && idleTime >= this.inactivityDuration) {
      this.emit('status-change', {
        previousStatus: STATUS_ONLINE,
        currentStatus: STATUS_AWAY,
      });

      this.emit('status:away');

      this.setStatus(STATUS_AWAY);
    }

    if (this.currentStatus === STATUS_AWAY && idleTime < this.inactivityDuration) {
      this.emit('status-change', {
        previousStatus: STATUS_AWAY,
        currentStatus: STATUS_ONLINE,
      });

      this.emit('status:online');

      this.setStatus(STATUS_ONLINE);
    }

    this.timedEvents.forEach(({ status, duration }) => {
      let willEmitTimedEvent = false;

      if (
        this.currentStatus === STATUS_AWAY
        && this.currentStatus === status
        && (idleTime - this.inactivityDuration) >= duration
      ) {
        willEmitTimedEvent = true;
      }

      if (
        this.currentStatus === STATUS_ONLINE
        && this.currentStatus === status
        && Date.now() - this.userLastCameOnlineAt >= duration
      ) {
        willEmitTimedEvent = true;
      }

      if (willEmitTimedEvent) {
        this.emit(`${status}:${duration}`);
      }
    });
  }

  /**
   * Parse an event name to work out what type of event it is
   * @param {string} eventName Name of the event
   * @private
   */
  // eslint-disable-next-line class-methods-use-this
  parseEventName(eventName) {
    const eventNameInfo = {
      isTimedEvent: false,
      status: undefined,
      duration: undefined,
    };

    const eventNameExpression = new RegExp(`^(${STATUS_AWAY}|${STATUS_ONLINE})(:([0-9]+))?$`);
    const eventNameParts = eventName.match(eventNameExpression);

    if (!eventNameParts) return eventNameInfo;

    let status = eventNameParts[0];
    const duration = eventNameParts[3];

    eventNameInfo.status = status;

    if (duration) {
      // eslint-disable-next-line prefer-destructuring
      status = eventNameParts[1];

      eventNameInfo.isTimedEvent = true;
      eventNameInfo.status = status;
      eventNameInfo.duration = Number(duration);
    }

    return eventNameInfo;
  }
}

module.exports = NodeAFK;
module.exports.STATUS_AWAY = STATUS_AWAY;
module.exports.STATUS_ONLINE = STATUS_ONLINE;
