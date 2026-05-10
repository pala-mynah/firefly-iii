/*
 * default-chart-settings.js
 * Copyright (c) 2023 james@firefly-iii.org
 *
 * This file is part of Firefly III (https://github.com/firefly-iii).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import formatMoney from "../util/format-money.js";

const palaColors = [
    'rgba(20,  153, 102, 0.9)',  // pala-mint
    'rgba(108, 197, 154, 0.9)',  // pala-mint-bright
    'rgba(10,  68,  133, 0.9)',  // pala-blue-500
    'rgba(111, 168, 255, 0.9)',  // info-blue
    'rgba(224, 162, 74,  0.9)',  // status-warn
    'rgba(225, 108, 108, 0.9)',  // status-alarm
    'rgba(182, 229, 201, 0.9)',  // pala-mint-ink
    'rgba(0,   172, 193, 0.9)',  // teal
    'rgba(171, 71,  188, 0.9)',  // purple
    'rgba(158, 157, 36,  0.9)',  // olive
];

export function getPalaColor(index) {
    return palaColors[index % palaColors.length];
}

function getDefaultChartSettings(type) {
    if ('sankey' === type) {
        return {
            type: 'sankey',
            data: {
                datasets: [],
            },
            options: {animations: false}
        }
    }
    if ('pie' === type) {
        return {
            type: 'pie',
            data: {
                datasets: [],
            }
        }
    }
    if ('column' === type) {
        return {
            type: 'bar',
            data: {
                labels: [],
                datasets: [],
            },
            options: {
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (tooltipItem) {
                                // console.log(tooltipItem);
                                let currency = tooltipItem.dataset.currency_code;
                                return formatMoney(tooltipItem.raw, currency);
                            },
                        },
                    },
                },
                maintainAspectRatio: false,
                scales: {}
            },
        };
    }
    if('bar' === type) {
        return {
            type: 'bar',
            data: {
                labels: [],
                datasets: [],
            },
            options: {
                maintainAspectRatio: false,
                indexAxis: 'y',
                // Elements options apply to all the options unless overridden in a dataset
                // In this case, we are setting the border of each horizontal bar to be 2px wide
                elements: {
                    bar: {
                        borderWidth: 2,
                    }
                },
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                    },
                    title: {
                        display: true,
                        text: 'Chart.js Horizontal Bar Chart'
                    }
                }
            },
        };
    }
    if ('line' === type) {
        return {
            options: {
                spanGaps: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (tooltipItem) {
                                let currency = tooltipItem.dataset.currency_code;
                                return formatMoney(tooltipItem.raw, currency);
                            },
                        },
                    },
                },
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            tooltipFormat: 'PP',
                            unit: 'day',
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.05)',
                        },
                        ticks: {
                            color: '#8896AE',
                            maxTicksLimit: 10,
                        },
                    },
                },
            },
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
        };
    }
    return {};
}

export {getDefaultChartSettings};
